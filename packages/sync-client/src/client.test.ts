import { decode, MAX_DRIFT_MS } from "@fieldsync/hlc";
import { describe, expect, it } from "vitest";
import { PUSH_BATCH, SyncClient, type Transport } from "./client.ts";
import { MemoryStorage } from "./storage.ts";
import { FakeServer } from "./testing.ts";

const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";

function device(
	deviceId: string,
	server: FakeServer,
	start = 1_000,
	transport: Transport = server,
) {
	let time = start;
	let ids = 0;
	const storage = new MemoryStorage();
	const client = new SyncClient({
		deviceId,
		clientVersion: "0.1.0",
		now: () => time,
		storage,
		transport,
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

	it("rebuilds the record from the server after a rejection", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		await phone.edit({ status: "assigned" });
		const rejected = await phone.edit({ notes: "forged" });
		await phone.edit({ priority: "urgent" });
		server.reject.add(rejected.opId);
		await phone.client.syncOnce();

		expect(phone.order()?.fields).toEqual({
			status: "assigned",
			priority: "urgent",
		});
	});

	it("forgets a record whose creation was rejected", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const create = await phone.edit({ status: "assigned" });
		server.reject.add(create.opId);
		await phone.client.syncOnce();
		expect(phone.order()).toBeUndefined();
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

	it("resends operations a closed session left mid-send", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const op = await phone.edit({ status: "assigned" });
		// The page closed while this was on its way.
		await phone.storage.claimPending(1);
		await phone.client.syncOnce();

		expect(server.pushes).toEqual([{ ops: [op] }]);
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

describe("clock drift", () => {
	const TWO_DAYS = 2 * MAX_DRIFT_MS;

	it("re-sends operations stamped more than a day ahead", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server, TWO_DAYS);
		await phone.edit({ status: "assigned" });
		await phone.client.syncOnce();

		const [change] = server.changes;
		expect(phone.storage.outbox).toEqual([]);
		expect(change?.patch).toEqual({ status: "assigned" });
		expect(decode(change?.hlc ?? "").wall).toBeLessThanOrEqual(
			server.time + MAX_DRIFT_MS,
		);
		expect(phone.order()).toEqual(server.entities.get(`work_order:${ORDER}`));
	});

	it("keeps re-sent edits in order, and later edits after them", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server, TWO_DAYS);
		await phone.edit({ status: "assigned" });
		await phone.edit({ status: "in_progress" });
		await phone.client.syncOnce();
		expect(phone.order()?.fields).toEqual({ status: "in_progress" });

		await phone.edit({ status: "completed" });
		await phone.client.syncOnce();
		expect(server.entities.get(`work_order:${ORDER}`)?.fields).toEqual({
			status: "completed",
		});
	});

	it("corrects its clock from the server's time", async () => {
		const server = new FakeServer();
		server.time = 50_000;
		const phone = device(PHONE, server, 1_000);
		await phone.client.syncOnce();
		expect(phone.client.clockOffset()).toBe(49_000);
		const op = await phone.edit({ status: "assigned" });
		expect(decode(op.hlc).wall).toBe(50_000);
	});
});

describe("server reset", () => {
	it("drops the old copy, keeps unsent changes and pulls again", async () => {
		const server = new FakeServer();
		const phone = device(PHONE, server);
		const office = device(OFFICE, server);
		await office.edit({ title: "Old job" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()?.fields).toEqual({ title: "Old job" });

		// The server is wiped while the phone has an edit waiting.
		server.changes.length = 0;
		server.entities.clear();
		server.epoch = "epoch-2";
		const other = "00000000-0000-4000-8000-0000000000bb";
		await phone.client.mutate({
			entityType: "work_order",
			entityId: other,
			patch: { notes: "written before the reset" },
		});
		await phone.client.syncOnce();

		expect(phone.order()).toBeUndefined();
		expect(phone.storage.entities.get(`work_order:${other}`)?.fields).toEqual({
			notes: "written before the reset",
		});
		expect(phone.storage.epoch).toBe("epoch-2");
		expect(phone.storage.cursor).toBe(server.changes.length);
		expect(phone.storage.outbox).toEqual([]);
	});
});

describe("partial sync", () => {
	const TECH = "0a1b2c3d-0000-4000-8000-000000000003";

	// The phone syncs as technician "junior": it sees only orders assigned to him.
	function setup() {
		const server = new FakeServer();
		server.scopeOf = (state) =>
			typeof state.fields.assigneeId === "string"
				? state.fields.assigneeId
				: null;
		const asJunior: Transport = {
			push: (r) => server.push(r, "junior"),
			pull: (r) => server.pull(r, "junior"),
			entity: (r) => server.entity(r, "junior"),
		};
		return {
			server,
			office: device(OFFICE, server),
			phone: device(TECH, server, 1_000, asJunior),
		};
	}

	it("receives an order once assigned to it, with its earlier history", async () => {
		const { server, office, phone } = setup();
		await office.edit({ title: "Fix pump", notes: "Bring a wrench" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()).toBeUndefined();
		expect(phone.storage.cursor).toBe(1);

		office.advance(10);
		await office.edit({ assigneeId: "junior" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()).toEqual(server.entities.get(`work_order:${ORDER}`));
	});

	it("drops an order taken away, and gets it back later", async () => {
		const { server, office, phone } = setup();
		await office.edit({ title: "Fix pump", assigneeId: "junior" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()?.fields.title).toBe("Fix pump");

		office.advance(10);
		await office.edit({ assigneeId: "merveille" });
		office.advance(10);
		await office.edit({ notes: "Merveille's notes" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()).toBeUndefined();

		office.advance(10);
		await office.edit({ assigneeId: "junior" });
		await office.client.syncOnce();
		await phone.client.syncOnce();
		expect(phone.order()).toEqual(server.entities.get(`work_order:${ORDER}`));
		expect(phone.order()?.fields.notes).toBe("Merveille's notes");
	});

	it("moves its clock past the stamps inside an order it receives", async () => {
		const { server, office, phone } = setup();
		// A device ahead in time writes first, before the order is the phone's.
		const ahead = device("eeeeeeee-0000-4000-8000-000000000004", server, 9_000);
		await ahead.edit({ notes: "from the future" });
		await ahead.client.syncOnce();
		await office.edit({ assigneeId: "junior" });
		await office.client.syncOnce();

		await phone.client.syncOnce();
		const newest = phone.order()?.clocks.notes ?? "";
		expect(decode(newest).wall).toBe(9_000);
		expect(phone.client.clockState() >= newest).toBe(true);
	});
});
