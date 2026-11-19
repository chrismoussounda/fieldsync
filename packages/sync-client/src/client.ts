import { Clock, decode, encode, MAX_DRIFT_MS } from "@fieldsync/hlc";
import { merge } from "@fieldsync/merge";
import type {
	EntityRequest,
	EntityResponse,
	Op,
	OpResult,
	PullRequest,
	PullResponse,
	PushRequest,
	PushResponse,
} from "@fieldsync/protocol";
import type { SyncStorage } from "./storage.ts";

export interface Transport {
	push(request: PushRequest): Promise<PushResponse>;
	pull(request: PullRequest): Promise<PullResponse>;
	entity(request: EntityRequest): Promise<EntityResponse>;
}

export type SyncClientOptions = {
	deviceId: string;
	clientVersion: string;
	storage: SyncStorage;
	transport: Transport;
	/** The device's own time, which may be wrong. */
	now?: () => number;
	/** The value of `clockState()` from the previous run. */
	savedClock?: string;
	newId?: () => string;
};

export type MutateInput = {
	entityType: string;
	entityId: string;
	kind?: Op["kind"];
	patch?: Op["patch"];
};

export const PUSH_BATCH = 100;
export const PULL_PAGE = 500;

export class SyncClient {
	readonly #deviceId: string;
	readonly #clientVersion: string;
	readonly #storage: SyncStorage;
	readonly #transport: Transport;
	readonly #now: () => number;
	readonly #newId: () => string;
	readonly #clock: Clock;
	// Server time minus device time, learned from every response.
	#offset = 0;

	constructor(options: SyncClientOptions) {
		this.#deviceId = options.deviceId;
		this.#clientVersion = options.clientVersion;
		this.#storage = options.storage;
		this.#transport = options.transport;
		this.#now = options.now ?? Date.now;
		this.#newId = options.newId ?? (() => crypto.randomUUID());
		this.#clock = new Clock(
			options.deviceId.slice(0, 8).toLowerCase(),
			() => this.#correctedNow(),
			options.savedClock,
		);
	}

	clockState(): string {
		return this.#clock.state();
	}

	/** The only way the app writes: applies the change locally and queues it. */
	async mutate({
		entityType,
		entityId,
		kind = "upsert",
		patch = {},
	}: MutateInput): Promise<Op> {
		const prev = await this.#storage.getEntity(entityType, entityId);
		const base: Op["base"] = {};
		for (const field of Object.keys(patch)) {
			const seen = prev?.clocks[field];
			if (seen) base[field] = seen;
		}
		const op: Op = {
			opId: this.#newId(),
			deviceId: this.#deviceId,
			entityType,
			entityId,
			kind,
			patch,
			base,
			hlc: this.#clock.tick(),
			clientVersion: this.#clientVersion,
		};
		const { state } = merge(prev, op, { detectConflicts: false });
		await this.#storage.commitLocal(op, state);
		return op;
	}

	async syncOnce(): Promise<void> {
		await this.#push();
		await this.#pull();
	}

	async #push(): Promise<void> {
		for (;;) {
			const batch = await this.#storage.claimPending(PUSH_BATCH);
			if (batch.length === 0) return;
			let response: PushResponse;
			try {
				response = await this.#transport.push({ ops: batch });
			} catch (error) {
				await this.#storage.releaseOps(batch.map((op) => op.opId));
				throw error;
			}
			this.#learnTime(response.serverTime);

			const drifted = new Set(
				response.results.filter(isDrift).map((r) => r.opId),
			);
			await this.#storage.resolveOps(
				response.results.filter((r) => !isDrift(r)),
			);
			if (drifted.size > 0) await this.#restamp(drifted);
			for (const result of response.results) {
				if (result.status !== "rejected" || isDrift(result)) continue;
				const op = batch.find((o) => o.opId === result.opId);
				if (op) await this.#rebuild(op);
			}
		}
	}

	async #pull(): Promise<void> {
		for (;;) {
			const cursor = await this.#storage.getCursor();
			const page = await this.#transport.pull({ cursor, limit: PULL_PAGE });
			this.#learnTime(page.serverTime);
			for (const change of page.changes) this.#clock.receive(change.hlc);
			await this.#storage.applyRemote(page.changes, page.nextCursor);
			if (!page.hasMore) return;
		}
	}

	// Pulls the clock back to the drift limit, not to the corrected time: the
	// server only accepts stamps below that limit, so re-issued operations still
	// sort after every edit this device made before.
	async #restamp(rejected: Set<string | null>): Promise<void> {
		const limit = this.#correctedNow() + MAX_DRIFT_MS;
		const { node } = decode(this.#clock.state());
		this.#clock.rewind(encode({ wall: limit, counter: 0, node }));
		const changed = await this.#storage.rewriteOps((op) =>
			rejected.has(op.opId) || decode(op.hlc).wall > limit
				? { ...op, opId: this.#newId(), hlc: this.#clock.tick() }
				: null,
		);
		const rebuilt = new Set<string>();
		for (const op of changed) {
			const key = `${op.entityType}:${op.entityId}`;
			if (rebuilt.has(key)) continue;
			rebuilt.add(key);
			await this.#rebuild(op);
		}
	}

	async #rebuild({ entityType, entityId }: Op): Promise<void> {
		const response = await this.#transport.entity({ entityType, entityId });
		this.#learnTime(response.serverTime);
		await this.#storage.rebuildEntity(entityType, entityId, response.entity);
	}

	#learnTime(serverTime: number): void {
		this.#offset = serverTime - this.#now();
	}

	#correctedNow(): number {
		return this.#now() + this.#offset;
	}
}

function isDrift(result: OpResult): boolean {
	return result.status === "rejected" && result.reason === "CLOCK_DRIFT";
}
