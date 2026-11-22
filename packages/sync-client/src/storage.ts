import { merge } from "@fieldsync/merge";
import type { Change, EntityState, Op, OpResult } from "@fieldsync/protocol";

export type OutboxEntry =
	| { op: Op; status: "pending" | "inflight" }
	| { op: Op; status: "dead"; reason: string };

export interface SyncStorage {
	getEntity(type: string, id: string): Promise<EntityState | null>;
	/** Writes the new local state and queues the operation, atomically. */
	commitLocal(op: Op, state: EntityState): Promise<void>;
	/** Marks up to `limit` pending operations inflight, oldest first. */
	claimPending(limit: number): Promise<Op[]>;
	releaseOps(opIds: string[]): Promise<void>;
	/** Marks pending again every operation a closed session left inflight. */
	releaseInflight(): Promise<void>;
	resolveOps(results: OpResult[]): Promise<void>;
	getCursor(): Promise<number>;
	/** The server epoch the stored records belong to; null before the first pull. */
	getEpoch(): Promise<string | null>;
	/** Merges pulled changes and stores the new cursor and epoch, atomically. */
	applyRemote(
		changes: Change[],
		nextCursor: number,
		epoch: string,
	): Promise<void>;
	/**
	 * Forgets everything pulled, after the server's data was reset: records are
	 * rebuilt from the operations not yet accepted, the cursor goes back to 0.
	 */
	resetRemote(): Promise<void>;
	/**
	 * Replaces the operations `rewrite` returns a new version for, in outbox
	 * order, and marks them pending. Returns the new versions.
	 */
	rewriteOps(rewrite: (op: Op) => Op | null): Promise<Op[]>;
	/** Replaces a record with the server's copy plus the operations not yet accepted. */
	rebuildEntity(
		type: string,
		id: string,
		snapshot: EntityState | null,
	): Promise<void>;
	/** The queued operations, oldest first. */
	getOutbox(): Promise<OutboxEntry[]>;
	/** Removes rejected operations once the user has seen them; others stay. */
	discardDead(opIds: string[]): Promise<void>;
}

export function applyChange(
	state: EntityState | null,
	change: Change,
): EntityState {
	const { scope: _scope, state: _state, children: _children, ...rest } = change;
	const op: Op = { ...rest, base: {}, clientVersion: "" };
	return merge(state, op, { detectConflicts: false }).state;
}

/**
 * A pulled change, then one per record that belongs to it and enters or leaves
 * with it, in the order to apply them.
 */
export function expand(change: Change): Change[] {
	const { children, ...own } = change;
	if (!children || !change.scope) return [own];
	const scope = change.scope;
	return [
		own,
		...children.map(({ entityType, entityId, state }) => {
			const child: Change = { ...own, entityType, entityId, scope, patch: {} };
			delete child.state;
			return state ? { ...child, state } : child;
		}),
	];
}

/**
 * A pulled change applied to a record, given the device's operations on it not
 * yet accepted; null once the record is gone from the device.
 */
export function applyPulled(
	state: EntityState | null,
	change: Change,
	pending: Op[],
): EntityState | null {
	// Entering: the server's copy replaces what came before. Leaving: only
	// unsent edits stay, until the server refuses them.
	if (change.scope === "enter" && change.state) {
		return replay(structuredClone(change.state), pending);
	}
	if (change.scope === "leave") return replay(null, pending);
	return applyChange(state, change);
}

export function replay(
	snapshot: EntityState | null,
	ops: Op[],
): EntityState | null {
	let state = snapshot;
	for (const op of ops)
		state = merge(state, op, { detectConflicts: false }).state;
	return state;
}

export class MemoryStorage implements SyncStorage {
	readonly entities = new Map<string, EntityState>();
	readonly outbox: OutboxEntry[] = [];
	cursor = 0;
	epoch: string | null = null;

	async getEntity(type: string, id: string): Promise<EntityState | null> {
		return this.entities.get(key(type, id)) ?? null;
	}

	async commitLocal(op: Op, state: EntityState): Promise<void> {
		this.entities.set(key(op.entityType, op.entityId), state);
		this.outbox.push({ op, status: "pending" });
	}

	async claimPending(limit: number): Promise<Op[]> {
		const claimed: Op[] = [];
		for (const entry of this.outbox) {
			if (claimed.length === limit) break;
			if (entry.status !== "pending") continue;
			entry.status = "inflight";
			claimed.push(entry.op);
		}
		return claimed;
	}

	async releaseInflight(): Promise<void> {
		for (const entry of this.outbox) {
			if (entry.status === "inflight") entry.status = "pending";
		}
	}

	async releaseOps(opIds: string[]): Promise<void> {
		for (const entry of this.outbox) {
			if (entry.status === "inflight" && opIds.includes(entry.op.opId)) {
				entry.status = "pending";
			}
		}
	}

	async resolveOps(results: OpResult[]): Promise<void> {
		for (const result of results) {
			const index = this.outbox.findIndex((e) => e.op.opId === result.opId);
			const entry = this.outbox[index];
			if (!entry) continue;
			if (result.status === "rejected") {
				this.outbox[index] = {
					op: entry.op,
					status: "dead",
					reason: result.reason,
				};
			} else {
				this.outbox.splice(index, 1);
			}
		}
	}

	async getCursor(): Promise<number> {
		return this.cursor;
	}

	async getEpoch(): Promise<string | null> {
		return this.epoch;
	}

	async applyRemote(
		changes: Change[],
		nextCursor: number,
		epoch: string,
	): Promise<void> {
		for (const change of changes.flatMap(expand)) {
			const k = key(change.entityType, change.entityId);
			const pending = this.#pending(change.entityType, change.entityId);
			const state = applyPulled(this.entities.get(k) ?? null, change, pending);
			if (state) this.entities.set(k, state);
			else this.entities.delete(k);
		}
		this.cursor = nextCursor;
		this.epoch = epoch;
	}

	async resetRemote(): Promise<void> {
		this.entities.clear();
		for (const { op } of this.outbox.filter((e) => e.status !== "dead")) {
			const k = key(op.entityType, op.entityId);
			const state = replay(this.entities.get(k) ?? null, [op]);
			if (state) this.entities.set(k, state);
		}
		this.cursor = 0;
		this.epoch = null;
	}

	async rewriteOps(rewrite: (op: Op) => Op | null): Promise<Op[]> {
		const changed: Op[] = [];
		for (const [index, entry] of this.outbox.entries()) {
			if (entry.status === "dead") continue;
			const op = rewrite(entry.op);
			if (!op) continue;
			this.outbox[index] = { op, status: "pending" };
			changed.push(op);
		}
		return changed;
	}

	async rebuildEntity(
		type: string,
		id: string,
		snapshot: EntityState | null,
	): Promise<void> {
		const state = replay(snapshot, this.#pending(type, id));
		if (state) this.entities.set(key(type, id), state);
		else this.entities.delete(key(type, id));
	}

	#pending(type: string, id: string): Op[] {
		return this.outbox
			.filter(
				(e) =>
					e.status !== "dead" &&
					e.op.entityType === type &&
					e.op.entityId === id,
			)
			.map((e) => e.op);
	}

	async getOutbox(): Promise<OutboxEntry[]> {
		return this.outbox.map((entry) => ({ ...entry }));
	}

	async discardDead(opIds: string[]): Promise<void> {
		for (let i = this.outbox.length - 1; i >= 0; i--) {
			const entry = this.outbox[i];
			if (entry?.status === "dead" && opIds.includes(entry.op.opId)) {
				this.outbox.splice(i, 1);
			}
		}
	}
}

function key(type: string, id: string): string {
	return `${type}:${id}`;
}
