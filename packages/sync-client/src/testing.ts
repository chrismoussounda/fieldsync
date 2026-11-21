import { decode, MAX_DRIFT_MS } from "@fieldsync/hlc";
import { merge } from "@fieldsync/merge";
import {
	type Change,
	type EntityRequest,
	type EntityResponse,
	type EntityState,
	type Op,
	type OpResult,
	OpSchema,
	type PullRequest,
	type PullResponse,
	type PushRequest,
	type PushResponse,
} from "@fieldsync/protocol";
import type { Transport } from "./client.ts";

/**
 * Who a device syncs for: null sees every record, a string only the records
 * whose scope it is (a technician and the orders assigned to them).
 */
export type Audience = string | null;

/** A minimal in-memory server, enough to exercise the client. */
export class FakeServer implements Transport {
	readonly changes: Change[] = [];
	readonly entities = new Map<string, EntityState>();
	readonly pushes: PushRequest[] = [];
	readonly #results = new Map<string, OpResult>();
	// Each change's record scope before and after it, by seq - 1.
	readonly #scopes: { before: string | null; after: string | null }[] = [];
	reject = new Set<string>();
	/** Whose record it is; null when only full-access devices see it. */
	scopeOf: (state: EntityState) => string | null = () => null;
	authorize: (
		op: Op,
		current: EntityState | null,
		audience: Audience,
	) => boolean = () => true;
	epoch = "epoch-1";
	offline = false;
	time = 0;

	async push(
		request: PushRequest,
		audience: Audience = null,
	): Promise<PushResponse> {
		if (this.offline) throw new Error("offline");
		this.pushes.push(request);
		const results = request.ops.map((raw) => {
			const op = OpSchema.parse(raw);
			const prior = this.#results.get(op.opId);
			if (prior) {
				return prior.status === "applied"
					? ({ ...prior, status: "duplicate" } as OpResult)
					: prior;
			}
			if (decode(op.hlc).wall - this.time > MAX_DRIFT_MS) {
				return {
					opId: op.opId,
					status: "rejected",
					reason: "CLOCK_DRIFT",
				} as const;
			}
			const key = `${op.entityType}:${op.entityId}`;
			const current = this.entities.get(key) ?? null;
			if (this.reject.has(op.opId) || !this.authorize(op, current, audience)) {
				const rejected = {
					opId: op.opId,
					status: "rejected",
					reason: "FORBIDDEN",
				} as const;
				this.#results.set(op.opId, rejected);
				return rejected;
			}
			const { state, won } = merge(current, op);
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
			this.#scopes.push({
				before: current ? this.scopeOf(current) : null,
				after: this.scopeOf(state),
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
		return { results, serverTime: this.time };
	}

	async entity(
		{ entityType, entityId }: EntityRequest,
		audience: Audience = null,
	): Promise<EntityResponse> {
		if (this.offline) throw new Error("offline");
		const entity = this.entities.get(`${entityType}:${entityId}`) ?? null;
		const visible =
			entity && (audience === null || this.scopeOf(entity) === audience);
		return {
			entity: visible ? structuredClone(entity) : null,
			serverTime: this.time,
		};
	}

	async pull(
		{ cursor, limit }: PullRequest,
		audience: Audience = null,
	): Promise<PullResponse> {
		if (this.offline) throw new Error("offline");
		const after = this.changes.filter(
			(c) => c.seq > cursor && this.#touches(c.seq, audience),
		);
		const page = after.slice(0, limit);
		const hasMore = after.length > limit;
		return {
			epoch: this.epoch,
			changes: page.map((c) => this.#annotate(c, audience)),
			// Past the changes this device does not see, too.
			nextCursor: hasMore
				? (page.at(-1)?.seq ?? cursor)
				: Math.max(cursor, this.changes.length),
			hasMore,
			serverTime: this.time,
		};
	}

	#touches(seq: number, audience: Audience): boolean {
		if (audience === null) return true;
		const scope = this.#scopes[seq - 1];
		return scope?.before === audience || scope?.after === audience;
	}

	#annotate(change: Change, audience: Audience): Change {
		const scope = this.#scopes[change.seq - 1];
		if (audience === null || !scope || scope.before === scope.after) {
			return change;
		}
		if (scope.before === audience) return { ...change, scope: "leave" };
		const state = this.entities.get(`${change.entityType}:${change.entityId}`);
		if (!state) return change;
		return { ...change, scope: "enter", state: structuredClone(state) };
	}
}
