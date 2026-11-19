import { HttpError, MemoryStorage, SyncClient } from "@fieldsync/sync-client";
import { FakeServer } from "@fieldsync/sync-client/testing";
import { describe, expect, it } from "vitest";
import { SyncLoop } from "./loop.ts";

const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const ORDER = "00000000-0000-4000-8000-0000000000aa";

function setup() {
	const server = new FakeServer();
	let pulls = 0;
	const transport = {
		push: (request: Parameters<FakeServer["push"]>[0]) => server.push(request),
		entity: (request: Parameters<FakeServer["entity"]>[0]) =>
			server.entity(request),
		pull: (request: Parameters<FakeServer["pull"]>[0]) => {
			pulls += 1;
			return server.pull(request);
		},
	};
	const client = new SyncClient({
		deviceId: PHONE,
		clientVersion: "0.1.0",
		storage: new MemoryStorage(),
		transport,
		now: () => 1_000,
	});
	const saved: string[] = [];
	const loop = new SyncLoop({
		client,
		saveClock: async (clock) => {
			saved.push(clock);
		},
		now: () => 5_000,
	});
	return { server, client, loop, saved, pulls: () => pulls };
}

const edit = { entityType: "work_order", entityId: ORDER, patch: { a: "1" } };

describe("SyncLoop", () => {
	it("syncs and records when", async () => {
		const { loop } = setup();
		const seen: string[] = [];
		loop.subscribe(() => seen.push(loop.status().state));
		await loop.run();
		expect(seen).toEqual(["syncing", "idle"]);
		expect(loop.status()).toEqual({ state: "idle", lastSyncedAt: 5_000 });
	});

	it("sends a change right after it is made, and saves the clock", async () => {
		const { loop, server, client, saved } = setup();
		await loop.mutate(edit);
		await loop.run();
		expect(server.changes).toHaveLength(1);
		expect(saved.at(-1)).toBe(client.clockState());
	});

	it("waits offline and sends once the network is back", async () => {
		const { loop, server } = setup();
		server.offline = true;
		await loop.mutate(edit);
		await loop.run();
		expect(loop.status().state).toBe("offline");
		server.offline = false;
		await loop.run();
		expect(loop.status().state).toBe("idle");
		expect(server.changes).toHaveLength(1);
	});

	it("folds requests made during a run into one more run", async () => {
		const { loop, pulls } = setup();
		await Promise.all([loop.run(), loop.run(), loop.run()]);
		expect(pulls()).toBe(2);
	});

	it("treats a gateway that cannot reach the server as offline", async () => {
		const { loop, server } = setup();
		server.push = async () => {
			throw new HttpError(502, undefined);
		};
		await loop.mutate(edit);
		await loop.run();
		expect(loop.status().state).toBe("offline");
	});

	it("reports a refusal from the server as an error", async () => {
		const { loop, server } = setup();
		server.push = async () => {
			throw new HttpError(401, "UNAUTHORIZED");
		};
		await loop.mutate(edit);
		await loop.run();
		expect(loop.status().state).toBe("error");
	});
});
