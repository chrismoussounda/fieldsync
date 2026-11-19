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
	resolveOps(results: OpResult[]): Promise<void>;
	getCursor(): Promise<number>;
	/** Merges pulled changes and stores the new cursor, atomically. */
	applyRemote(changes: Change[], nextCursor: number): Promise<void>;
	/** Replaces a record with the server's copy plus the operations not yet accepted. */
	rebuildEntity(
		type: string,
		id: string,
		snapshot: EntityState | null,
	): Promise<void>;
}

export function applyChange(
	state: EntityState | null,
	change: Change,
): EntityState {
	const op: Op = { ...change, base: {}, clientVersion: "" };
	return merge(state, op, { detectConflicts: false }).state;
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

	async applyRemote(changes: Change[], nextCursor: number): Promise<void> {
		for (const change of changes) {
			const k = key(change.entityType, change.entityId);
			this.entities.set(k, applyChange(this.entities.get(k) ?? null, change));
		}
		this.cursor = nextCursor;
	}

	async rebuildEntity(
		type: string,
		id: string,
		snapshot: EntityState | null,
	): Promise<void> {
		const ops = this.outbox
			.filter(
				(e) =>
					e.status !== "dead" &&
					e.op.entityType === type &&
					e.op.entityId === id,
			)
			.map((e) => e.op);
		const state = replay(snapshot, ops);
		if (state) this.entities.set(key(type, id), state);
		else this.entities.delete(key(type, id));
	}
}

function key(type: string, id: string): string {
	return `${type}:${id}`;
}
