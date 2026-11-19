import { merge } from "@fieldsync/merge";
import {
	type Change,
	type EntityRequest,
	type EntityResponse,
	type EntityState,
	type OpResult,
	OpSchema,
	type PullRequest,
	type PullResponse,
	type PushRequest,
	type PushResponse,
} from "@fieldsync/protocol";
import type { Transport } from "./client.ts";

/** A minimal in-memory server, enough to exercise the client. */
export class FakeServer implements Transport {
	readonly changes: Change[] = [];
	readonly entities = new Map<string, EntityState>();
	readonly pushes: PushRequest[] = [];
	readonly #results = new Map<string, OpResult>();
	reject = new Set<string>();
	offline = false;

	async push(request: PushRequest): Promise<PushResponse> {
		if (this.offline) throw new Error("offline");
		this.pushes.push(request);
		const results = request.ops.map((raw) => {
			const op = OpSchema.parse(raw);
			const prior = this.#results.get(op.opId);
			if (prior) return { ...prior, status: "duplicate" } as OpResult;
			if (this.reject.has(op.opId)) {
				return {
					opId: op.opId,
					status: "rejected",
					reason: "FORBIDDEN",
				} as const;
			}
			const key = `${op.entityType}:${op.entityId}`;
			const { state, won } = merge(this.entities.get(key) ?? null, op);
			this.entities.set(key, state);
			const seq = this.changes.length + 1;
			this.changes.push({
				seq,
				opId: op.opId,
				deviceId: op.deviceId,
				entityType: op.entityType,
				entityId: op.entityId,
				kind: op.kind,
				patch: won,
				hlc: op.hlc,
			});
			const result: OpResult = {
				opId: op.opId,
				status: "applied",
				seq,
				conflicts: [],
			};
			this.#results.set(op.opId, result);
			return result;
		});
		return { results, serverTime: 0 };
	}

	async entity({
		entityType,
		entityId,
	}: EntityRequest): Promise<EntityResponse> {
		if (this.offline) throw new Error("offline");
		const entity = this.entities.get(`${entityType}:${entityId}`) ?? null;
		return { entity: structuredClone(entity), serverTime: 0 };
	}

	async pull({ cursor, limit }: PullRequest): Promise<PullResponse> {
		if (this.offline) throw new Error("offline");
		const after = this.changes.filter((c) => c.seq > cursor);
		const changes = after.slice(0, limit);
		return {
			changes,
			nextCursor: changes.at(-1)?.seq ?? cursor,
			hasMore: after.length > limit,
			serverTime: 0,
		};
	}
}
