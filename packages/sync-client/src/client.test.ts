import { Clock, decode } from "@fieldsync/hlc";
import { describe, expect, it } from "vitest";
import { PUSH_BATCH, SyncClient } from "./client.ts";
import { MemoryStorage } from "./storage.ts";
import { FakeServer } from "./testing.ts";

const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";

function device(deviceId: string, server: FakeServer, start = 1_000) {
	let time = start;
	let ids = 0;
	const storage = new MemoryStorage();
	const client = new SyncClient({
		deviceId,
		clientVersion: "0.1.0",
		clock: new Clock(deviceId.slice(0, 8), () => time),
		storage,
		transport: server,
		newId: () =>
			`${deviceId.slice(0, 8)}-0000-7000-8000-${(++ids).toString(16).padStart(12, "0")}`,
	});
	const edit = (patch: Record<string, string>) =>
		client.mutate({ entityType: "work_order", entityId: ORDER, patch });
	return {
		client,
		storage,
		edit,
		order: () => storage.entities.get(`work_order:${ORDER}`),
		advance: (ms: number) => {
			time += ms;
		},
	};
}

describe("mutate", () => {
	it("applies the change locally and queues it", async () => {
		const phone = device(PHONE, new FakeServer());
		const op = await phone.edit({ status: "assigned" });

		expect(phone.order()?.fields).toEqual({ status: "assigned" });
		expect(phone.storage.outbox).toEqual([{ op, status: "pending" }]);
		expect(decode(op.hlc)).toMatchObject({ wall: 1_000, node: "0a1b2c3d" });
	});

	it("records the clock of the value the user replaced", async () => {
		const phone = device(PHONE, new FakeServer());
		const first = await phone.edit({ status: "assigned" });
		const second = await phone.edit({
			status: "in_progress",
			notes: "on site",
		});
		expect(second.base).toEqual({ status: first.hlc });
	});
});

describe("push", () => {
	it("sends pending operations and clears the applied ones", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const op = await phone.edit({ status: "assigned" });
		await phone.client.syncOnce();

		expect(server.pushes).toEqual([{ ops: [op] }]);
		expect(phone.storage.outbox).toEqual([]);
	});

	it("keeps rejected operations as dead and stops sending them", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const op = await phone.edit({ status: "assigned" });
		server.reject.add(op.opId);
		await phone.client.syncOnce();
		await phone.client.syncOnce();

		expect(phone.storage.outbox).toEqual([
			{ op, status: "dead", reason: "FORBIDDEN" },
		]);
		expect(server.pushes).toHaveLength(1);
	});

	it("puts operations back when the network fails, and resends them later", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const op = await phone.edit({ status: "assigned" });
		server.offline = true;
		await expect(phone.client.syncOnce()).rejects.toThrow("offline");
		expect(phone.storage.outbox).toEqual([{ op, status: "pending" }]);

		server.offline = false;
		await phone.client.syncOnce();
		expect(phone.storage.outbox).toEqual([]);
	});

	it("sends a long queue in batches", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		for (let i = 0; i < PUSH_BATCH * 2 + 1; i++) {
			await phone.edit({ notes: `note ${i}` });
		}
		await phone.client.syncOnce();
		expect(server.pushes.map((p) => p.ops.length)).toEqual([
			PUSH_BATCH,
			PUSH_BATCH,
			1,
		]);
	});
});

describe("pull", () => {
	it("applies changes from other devices and stores the cursor", async () => {
		const server = new FakeServer();
		const office = device(OFFICE, server);
		const phone = device(PHONE, server);
		await office.edit({ status: "assigned", priority: "urgent" });
		await office.client.syncOnce();
		await phone.client.syncOnce();

		expect(phone.order()?.fields).toEqual({
			status: "assigned",
			priority: "urgent",
		});
		expect(phone.storage.cursor).toBe(1);
	});

	it("keeps a local edit to another field while pulling", async () => {
		const server = new FakeServer();
		const office = device(OFFICE, server);
		const phone = device(PHONE, server);
		await office.edit({ status: "assigned", priority: "normal" });
		await office.client.syncOnce();
		await phone.client.syncOnce();

		phone.advance(10);
		await phone.edit({ status: "in_progress" });
		office.advance(20);
		await office.edit({ priority: "urgent" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		await office.client.syncOnce();

		const merged = { status: "in_progress", priority: "urgent" };
		expect(phone.order()?.fields).toEqual(merged);
		expect(office.order()?.fields).toEqual(merged);
	});

	it("moves the clock past stamps from other devices", async () => {
		const server = new FakeServer();
		const office = device(OFFICE, server, 5_000);
		const phone = device(PHONE, server, 1_000);
		const remote = await office.edit({ status: "cancelled" });
		await office.client.syncOnce();
		await phone.client.syncOnce();

		const local = await phone.edit({ notes: "later" });
		expect(local.hlc > remote.hlc).toBe(true);
	});
});
