import type { Change, EntityState, Op, OpResult } from "@fieldsync/protocol";
import {
	applyChange,
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

export class LocalDb extends Dexie {
	entities!: Table<EntityRow, [string, string]>;
	outbox!: EntityTable<OutboxRow, "seq">;
	meta!: Table<MetaRow, string>;

	constructor(name = "fieldsync") {
		super(name);
		this.version(1).stores({
			entities: "[type+id]",
			outbox: "++seq, &opId, status, [entityType+entityId]",
			meta: "key",
		});
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

	applyRemote(changes: Change[], nextCursor: number): Promise<void> {
		const db = this.#db;
		return db.transaction("rw", db.entities, db.meta, async () => {
			for (const change of changes) {
				const key: [string, string] = [change.entityType, change.entityId];
				const current = (await db.entities.get(key))?.state ?? null;
				await db.entities.put({
					type: change.entityType,
					id: change.entityId,
					state: applyChange(current, change),
				});
			}
			await db.meta.put({ key: "cursor", value: nextCursor });
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
			const ops = await db.outbox
				.where("[entityType+entityId]")
				.equals([type, id])
				.and((r) => r.status !== "dead")
				.sortBy("seq");
			const state = replay(
				snapshot,
				ops.map((r) => r.op),
			);
			if (state) await db.entities.put({ type, id, state });
			else await db.entities.delete([type, id]);
		});
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
