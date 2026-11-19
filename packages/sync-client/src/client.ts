import type { Clock } from "@fieldsync/hlc";
import { merge } from "@fieldsync/merge";
import type {
	EntityRequest,
	EntityResponse,
	Op,
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
	clock: Clock;
	storage: SyncStorage;
	transport: Transport;
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
	readonly #options: Required<SyncClientOptions>;

	constructor(options: SyncClientOptions) {
		this.#options = { newId: () => crypto.randomUUID(), ...options };
	}

	/** The only way the app writes: applies the change locally and queues it. */
	async mutate({
		entityType,
		entityId,
		kind = "upsert",
		patch = {},
	}: MutateInput): Promise<Op> {
		const { storage, clock, deviceId, clientVersion, newId } = this.#options;
		const prev = await storage.getEntity(entityType, entityId);
		const base: Op["base"] = {};
		for (const field of Object.keys(patch)) {
			const seen = prev?.clocks[field];
			if (seen) base[field] = seen;
		}
		const op: Op = {
			opId: newId(),
			deviceId,
			entityType,
			entityId,
			kind,
			patch,
			base,
			hlc: clock.tick(),
			clientVersion,
		};
		const { state } = merge(prev, op, { detectConflicts: false });
		await storage.commitLocal(op, state);
		return op;
	}

	async syncOnce(): Promise<void> {
		await this.#push();
		await this.#pull();
	}

	async #push(): Promise<void> {
		const { storage, transport } = this.#options;
		for (;;) {
			const batch = await storage.claimPending(PUSH_BATCH);
			if (batch.length === 0) return;
			let response: PushResponse;
			try {
				response = await transport.push({ ops: batch });
			} catch (error) {
				await storage.releaseOps(batch.map((op) => op.opId));
				throw error;
			}
			await storage.resolveOps(response.results);
			for (const result of response.results) {
				if (result.status !== "rejected") continue;
				const op = batch.find((o) => o.opId === result.opId);
				if (op) await this.#rebuild(op);
			}
		}
	}

	async #rebuild({ entityType, entityId }: Op): Promise<void> {
		const { storage, transport } = this.#options;
		const { entity } = await transport.entity({ entityType, entityId });
		await storage.rebuildEntity(entityType, entityId, entity);
	}

	async #pull(): Promise<void> {
		const { storage, transport, clock } = this.#options;
		for (;;) {
			const cursor = await storage.getCursor();
			const page = await transport.pull({ cursor, limit: PULL_PAGE });
			for (const change of page.changes) clock.receive(change.hlc);
			await storage.applyRemote(page.changes, page.nextCursor);
			if (!page.hasMore) return;
		}
	}
}
