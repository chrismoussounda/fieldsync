import type { Change, EntityState, Op, OpResult } from "@fieldsync/protocol";
import {
	applyPulled,
	expand,
	type OutboxEntry,
	replay,
	type SyncStorage,
} from "@fieldsync/sync-client";
import { Dexie, type EntityTable, type Table } from "dexie";

type EntityRow = { type: string; id: string; state: EntityState };

type OutboxRow = {
	// Auto-incremented, so rows read back in the order they were queued.
	seq?: number;
	opId: string;
	entityType: string;
	entityId: string;
	op: Op;
	status: OutboxEntry["status"];
	reason?: string;
};

// Small values kept next to the sync state: cursor, device id, clock, session.
type MetaRow = { key: string; value: unknown };

/** A photo's image on this device; `uploaded` is 0 until the server has it. */
export type FileRow = {
	id: string;
	type: string;
	bytes: ArrayBuffer;
	uploaded: 0 | 1;
};

export class LocalDb extends Dexie {
	entities!: Table<EntityRow, [string, string]>;
	outbox!: EntityTable<OutboxRow, "seq">;
	meta!: Table<MetaRow, string>;
	files!: Table<FileRow, string>;

	constructor(name = "fieldsync") {
		super(name);
		this.version(1).stores({
			entities: "[type+id]",
			outbox: "++seq, &opId, status, [entityType+entityId]",
			meta: "key",
		});
		this.version(2).stores({ files: "id, uploaded" });
	}

	ofType(type: string): Promise<EntityRow[]> {
		return this.entities
			.where("[type+id]")
			.between([type, Dexie.minKey], [type, Dexie.maxKey])
			.toArray();
	}

	async getMeta<T>(key: string): Promise<T | undefined> {
		return (await this.meta.get(key))?.value as T | undefined;
	}

	async setMeta(key: string, value: unknown): Promise<void> {
		await this.meta.put({ key, value });
	}
}

/** The sync client's state in IndexedDB, so it survives reloads and offline days. */
export class DexieStorage implements SyncStorage {
	readonly #db: LocalDb;

	constructor(db: LocalDb) {
		this.#db = db;
	}

	async getEntity(type: string, id: string): Promise<EntityState | null> {
		return (await this.#db.entities.get([type, id]))?.state ?? null;
	}

	commitLocal(op: Op, state: EntityState): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.entities, db.outbox, async () => {
			await db.entities.put({ type: op.entityType, id: op.entityId, state });
			await db.outbox.add(row(op, "pending"));
		});
	}

	claimPending(limit: number): Promise<Op[]> {
		const db = this.#db;
		return db.transaction("rw", db.outbox, async () => {
			const rows = await db.outbox
				.where("status")
				.equals("pending")
				.limit(limit)
				.toArray();
			await db.outbox.bulkPut(rows.map((r) => ({ ...r, status: "inflight" })));
			return rows.map((r) => r.op);
		});
	}

	async releaseInflight(): Promise<void> {
		await this.#db.outbox
			.where("status")
			.equals("inflight")
			.modify({ status: "pending" });
	}

	async releaseOps(opIds: string[]): Promise<void> {
		await this.#db.outbox
			.where("opId")
			.anyOf(opIds)
			.and((r) => r.status === "inflight")
			.modify({ status: "pending" });
	}

	resolveOps(results: OpResult[]): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.outbox, async () => {
			for (const result of results) {
				if (result.opId === null) continue;
				const rows = db.outbox.where("opId").equals(result.opId);
				if (result.status === "rejected") {
					await rows.modify({ status: "dead", reason: result.reason });
				} else {
					await rows.delete();
				}
			}
		});
	}

	async getCursor(): Promise<number> {
		return (await this.#db.getMeta<number>("cursor")) ?? 0;
	}

	async getEpoch(): Promise<string | null> {
		return (await this.#db.getMeta<string>("epoch")) ?? null;
	}

	applyRemote(
		changes: Change[],
		nextCursor: number,
		epoch: string,
	): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
			for (const change of changes.flatMap(expand)) {
				const key: [string, string] = [change.entityType, change.entityId];
				const current = (await db.entities.get(key))?.state ?? null;
				// Only entering or leaving records replay the queue.
				const pending = change.scope
					? await this.#pending(change.entityType, change.entityId)
					: [];
				const state = applyPulled(current, change, pending);
				if (state) {
					await db.entities.put({
						type: change.entityType,
						id: change.entityId,
						state,
					});
				} else {
					await db.entities.delete(key);
				}
			}
			await db.meta.put({ key: "cursor", value: nextCursor });
			await db.meta.put({ key: "epoch", value: epoch });
		});
	}

	resetRemote(): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
			await db.entities.clear();
			const rows = await db.outbox.toArray();
			const rebuilt = new Map<string, EntityRow>();
			for (const { op, status } of rows) {
				if (status === "dead") continue;
				const k = `${op.entityType}:${op.entityId}`;
				const state = replay(rebuilt.get(k)?.state ?? null, [op]);
				if (state) {
					rebuilt.set(k, { type: op.entityType, id: op.entityId, state });
				}
			}
			await db.entities.bulkPut([...rebuilt.values()]);
			await db.meta.bulkDelete(["cursor", "epoch"]);
		});
	}

	rewriteOps(rewrite: (op: Op) => Op | null): Promise<Op[]> {
		const db = this.#db;
		return db.transaction("rw", db.outbox, async () => {
			const changed: Op[] = [];
			for (const current of await db.outbox.toArray()) {
				if (current.status === "dead") continue;
				const op = rewrite(current.op);
				if (!op) continue;
				await db.outbox.put({ ...row(op, "pending"), seq: current.seq });
				changed.push(op);
			}
			return changed;
		});
	}

	rebuildEntity(
		type: string,
		id: string,
		snapshot: EntityState | null,
	): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.entities, db.outbox, async () => {
			const state = replay(snapshot, await this.#pending(type, id));
			if (state) await db.entities.put({ type, id, state });
			else await db.entities.delete([type, id]);
		});
	}

	// Inside the caller's transaction.
	async #pending(type: string, id: string): Promise<Op[]> {
		const rows = await this.#db.outbox
			.where("[entityType+entityId]")
			.equals([type, id])
			.and((r) => r.status !== "dead")
			.sortBy("seq");
		return rows.map((r) => r.op);
	}

	async discardDead(opIds: string[]): Promise<void> {
		await this.#db.outbox
			.where("opId")
			.anyOf(opIds)
			.and((r) => r.status === "dead")
			.delete();
	}

	async getOutbox(): Promise<OutboxEntry[]> {
		const rows = await this.#db.outbox.toArray();
		return rows.map((r) =>
			r.status === "dead"
				? { op: r.op, status: "dead", reason: r.reason ?? "" }
				: { op: r.op, status: r.status },
		);
	}
}

function row(op: Op, status: OutboxRow["status"]): OutboxRow {
	return {
		opId: op.opId,
		entityType: op.entityType,
		entityId: op.entityId,
		op,
		status,
	};
}
