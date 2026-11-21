import type {
	EntityRequest,
	EntityResponse,
	EntityState,
	PullRequest,
	PullResponse,
	PushRequest,
	PushResponse,
} from "@fieldsync/protocol";
import {
	MemoryStorage,
	SyncClient,
	type Transport,
} from "@fieldsync/sync-client";

/** null: the office, which syncs everything; else a technician's number. */
export type Audience = string | null;

export interface SimServer {
	push(
		deviceId: string,
		request: PushRequest,
		now: number,
		audience: Audience,
	): Promise<PushResponse>;
	pull(
		deviceId: string,
		request: PullRequest,
		now: number,
		audience: Audience,
	): Promise<PullResponse>;
	entity(
		deviceId: string,
		request: EntityRequest,
		now: number,
		audience: Audience,
	): Promise<EntityResponse>;
	/** Every record, keyed `type:id` like the client storage. */
	entities(): Promise<Map<string, EntityState>>;
}

/** Lose the response after the server applied it, or hold the request back and deliver it later. */
export type Fault = "none" | "lose" | "delay";

export type Action =
	| {
			kind: "edit";
			device: number;
			entity: number;
			patch: Record<string, number>;
	  }
	| { kind: "delete" | "restore"; device: number; entity: number }
	| { kind: "sync"; device: number; fault: Fault }
	| { kind: "network"; device: number; online: boolean }
	| { kind: "wait"; ms: number }
	| { kind: "jump"; device: number; ms: number }
	| { kind: "deliver"; index: number };

export class NetworkError extends Error {}

class SimTransport implements Transport {
	online = true;
	fault: Fault = "none";

	constructor(
		private readonly world: World,
		private readonly deviceId: string,
		private readonly audience: Audience,
	) {}

	async push(request: PushRequest): Promise<PushResponse> {
		this.#check();
		const fault = this.#takeFault();
		const sent = structuredClone(request);
		if (fault === "delay") {
			this.world.delayed.push({
				deviceId: this.deviceId,
				audience: this.audience,
				request: sent,
			});
			throw new NetworkError("timeout");
		}
		const response = await this.world.server.push(
			this.deviceId,
			sent,
			this.world.time,
			this.audience,
		);
		if (fault === "lose") throw new NetworkError("response lost");
		return response;
	}

	async pull(request: PullRequest): Promise<PullResponse> {
		this.#check();
		const response = await this.world.server.pull(
			this.deviceId,
			request,
			this.world.time,
			this.audience,
		);
		if (this.#takeFault() !== "none") throw new NetworkError("response lost");
		return response;
	}

	async entity(request: EntityRequest): Promise<EntityResponse> {
		this.#check();
		return this.world.server.entity(
			this.deviceId,
			request,
			this.world.time,
			this.audience,
		);
	}

	#check(): void {
		if (!this.online) throw new NetworkError("offline");
	}

	#takeFault(): Fault {
		const fault = this.fault;
		this.fault = "none";
		return fault;
	}
}

export type Device = {
	id: string;
	audience: Audience;
	skew: number;
	client: SyncClient;
	storage: MemoryStorage;
	transport: SimTransport;
	lastHlc: string;
};

export type WorldOptions = {
	skews: number[];
	/** Which devices are technicians; the first device is always the office. */
	techs?: boolean[];
	start?: number;
};

export class World {
	time: number;
	readonly devices: Device[];
	readonly delayed: {
		deviceId: string;
		audience: Audience;
		request: PushRequest;
	}[] = [];

	constructor(
		readonly server: SimServer,
		{ skews, techs = [], start = 1_800_000_000_000 }: WorldOptions,
	) {
		this.time = start;
		this.devices = skews.map((skew, n) => {
			const id = `${(n + 1).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
			const node = id.slice(0, 8);
			const audience = n > 0 && techs[n] ? String(n) : null;
			const storage = new MemoryStorage();
			const transport = new SimTransport(this, id, audience);
			let ops = 0;
			const client = new SyncClient({
				deviceId: id,
				clientVersion: "sim",
				now: () => this.time + device.skew,
				storage,
				transport,
				newId: () =>
					`${node}-0000-7000-8000-${(++ops).toString(16).padStart(12, "0")}`,
			});
			const device: Device = {
				id,
				audience,
				skew,
				client,
				storage,
				transport,
				lastHlc: "",
			};
			return device;
		});
	}

	async apply(action: Action): Promise<void> {
		switch (action.kind) {
			case "edit":
			case "delete":
			case "restore":
				return this.#mutate(action);
			case "sync":
				return this.#sync(action.device, action.fault);
			case "network":
				this.#device(action.device).transport.online = action.online;
				return;
			case "wait":
				this.time += action.ms;
				return;
			case "jump":
				this.#device(action.device).skew += action.ms;
				return;
			case "deliver": {
				if (this.delayed.length === 0) return;
				const [held] = this.delayed.splice(
					action.index % this.delayed.length,
					1,
				);
				if (held) {
					await this.server.push(
						held.deviceId,
						held.request,
						this.time,
						held.audience,
					);
				}
				return;
			}
		}
	}

	/** Reconnects everyone and syncs until no device has anything left to send. */
	async heal(): Promise<void> {
		for (const device of this.devices) {
			device.transport.online = true;
			device.transport.fault = "none";
		}
		while (this.delayed.length > 0)
			await this.apply({ kind: "deliver", index: 0 });
		for (let round = 0; round < 5 && this.#hasPending(); round++) {
			for (const device of this.devices) await device.client.syncOnce();
		}
		for (const device of this.devices) await device.client.syncOnce();
	}

	/** Rejected operations, by the device that made them. */
	deadOps() {
		return this.devices.flatMap((d) =>
			d.storage.outbox
				.filter((e) => e.status === "dead")
				.map((e) => ({ device: d, entry: e })),
		);
	}

	async #mutate(
		action: Extract<Action, { kind: "edit" | "delete" | "restore" }>,
	): Promise<void> {
		const device = this.#device(action.device);
		const op = await device.client.mutate({
			entityType: "work_order",
			entityId: `00000000-0000-4000-8000-${action.entity.toString(16).padStart(12, "0")}`,
			kind: action.kind === "edit" ? "upsert" : action.kind,
			patch: action.kind === "edit" ? action.patch : {},
		});
		if (op.hlc <= device.lastHlc) {
			throw new Error(`Clock went back on ${device.id}: ${op.hlc}`);
		}
		device.lastHlc = op.hlc;
	}

	async #sync(index: number, fault: Fault): Promise<void> {
		const device = this.#device(index);
		device.transport.fault = fault;
		try {
			await device.client.syncOnce();
		} catch (error) {
			if (!(error instanceof NetworkError)) throw error;
		}
		device.transport.fault = "none";
		// Re-stamping after a drift rejection is the one time the clock goes back.
		const clock = device.client.clockState();
		if (clock < device.lastHlc) device.lastHlc = clock;
	}

	#hasPending(): boolean {
		return this.devices.some((d) =>
			d.storage.outbox.some((e) => e.status !== "dead"),
		);
	}

	#device(index: number): Device {
		const device = this.devices[index % this.devices.length];
		if (!device) throw new Error("World has no devices");
		return device;
	}
}
