import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "./auth/session.ts";
import { createUser } from "./auth/users.ts";
import type { Database, Role } from "./db/schema.ts";
import { createTestDb, emptyTestDb } from "./db/testing.ts";
import { entityHistory } from "./history.ts";
import { handlePush } from "./sync/push.ts";
import { allowAll } from "./sync/testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ORDER = "00000000-0000-4000-8000-0000000000bb";

let db: Kysely<Database>;
let dispatcher: Principal;
let ids = 0;

beforeAll(async () => {
	db = await createTestDb();
});

afterAll(() => db.destroy());

async function member(name: string, role: Role, device: string, label: string) {
	const userId = await createUser(db, {
		orgId: ORG,
		email: `${name}@example.com`,
		name,
		password: "pw",
		role,
	});
	await db
		.insertInto("devices")
		.values({ id: device, org_id: ORG, user_id: userId, name: label })
		.execute();
	return { orgId: ORG, userId, deviceId: device, role };
}

function op(
	device: string,
	wall: number,
	patch: Op["patch"],
	{
		kind = "upsert",
		entityId = ORDER,
	}: Partial<Pick<Op, "kind" | "entityId">> = {},
): Op {
	ids += 1;
	return {
		opId: `00000000-0000-7000-8000-${ids.toString(16).padStart(12, "0")}`,
		deviceId: device,
		entityType: "work_order",
		entityId,
		kind,
		patch,
		base: {},
		hlc: encode({ wall, counter: 0, node: device.slice(0, 8) }),
		clientVersion: "0.1.0",
	};
}

const push = (device: string, o: Op) =>
	handlePush(
		db,
		{ orgId: ORG, deviceId: device },
		{ ops: [o] },
		{ authorize: allowAll, now: () => 10_000 },
	);

const history = (principal: Principal, id = ORDER) =>
	entityHistory(db, principal, "work_order", id);

beforeEach(async () => {
	await emptyTestDb(db);
	await db
		.insertInto("orgs")
		.values([
			{ id: ORG, name: "Demo" },
			{ id: OTHER_ORG, name: "Other" },
		])
		.execute();
	await member("Junior", "technician", PHONE, "Chrome on Android");
	dispatcher = await member("Grace", "dispatcher", OFFICE, "Edge on Windows");
});

describe("entityHistory", () => {
	it("lists who changed what, newest first by when it was made", async () => {
		await push(
			OFFICE,
			op(OFFICE, 1_000, { title: "Fix pump", status: "open" }),
		);
		await push(OFFICE, op(OFFICE, 3_000, { status: "assigned" }));
		// Made offline before the office's edit, synced after it.
		await push(PHONE, op(PHONE, 2_000, { status: "in_progress", notes: "Hi" }));

		expect(await history(dispatcher)).toEqual([
			{
				opId: expect.any(String),
				kind: "upsert",
				changes: { status: "assigned" },
				at: 3_000,
				receivedAt: expect.any(String),
				by: "Grace",
				device: "Edge on Windows",
			},
			{
				opId: expect.any(String),
				kind: "upsert",
				// Its status lost to the newer edit; only the notes took.
				changes: { notes: "Hi" },
				at: 2_000,
				receivedAt: expect.any(String),
				by: "Junior",
				device: "Chrome on Android",
			},
			expect.objectContaining({
				changes: { title: "Fix pump", status: "open" },
				at: 1_000,
				by: "Grace",
			}),
		]);
	});

	it("includes deletes and restores, and only this record", async () => {
		await push(OFFICE, op(OFFICE, 1_000, { title: "Fix pump" }));
		await push(
			OFFICE,
			op(OFFICE, 1_500, { title: "Other" }, { entityId: OTHER_ORDER }),
		);
		await push(OFFICE, op(OFFICE, 2_000, {}, { kind: "delete" }));
		await push(OFFICE, op(OFFICE, 3_000, {}, { kind: "restore" }));

		const entries = await history(dispatcher);
		expect(entries.map((e) => e.kind)).toEqual(["restore", "delete", "upsert"]);
	});

	it("keeps orgs apart", async () => {
		await push(OFFICE, op(OFFICE, 1_000, { title: "Fix pump" }));
		expect(await history({ ...dispatcher, orgId: OTHER_ORG })).toEqual([]);
	});
});
