import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "./auth/session.ts";
import { createUser } from "./auth/users.ts";
import { listConflicts, reviewConflict } from "./conflicts.ts";
import type { Database, Role } from "./db/schema.ts";
import { createTestDb, emptyTestDb } from "./db/testing.ts";
import { ApiError } from "./errors.ts";
import { handlePush } from "./sync/push.ts";
import { openRules } from "./sync/testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";

let db: Kysely<Database>;
let dispatcher: Principal;
let ids = 0;

beforeAll(async () => {
	db = await createTestDb();
});

afterAll(() => db.destroy());

async function member(name: string, role: Role, device: string) {
	const userId = await createUser(db, {
		orgId: ORG,
		email: `${name}@example.com`,
		name,
		password: "pw",
		role,
	});
	await db
		.insertInto("devices")
		.values({ id: device, org_id: ORG, user_id: userId, name: "Phone" })
		.execute();
	return { orgId: ORG, userId, deviceId: device, role };
}

function op(device: string, wall: number, patch: Op["patch"], base = {}): Op {
	ids += 1;
	return {
		opId: `00000000-0000-7000-8000-${ids.toString(16).padStart(12, "0")}`,
		deviceId: device,
		entityType: "work_order",
		entityId: ORDER,
		kind: "upsert",
		patch,
		base,
		hlc: encode({ wall, counter: 0, node: device.slice(0, 8) }),
		clientVersion: "0.1.0",
	};
}

const push = (device: string, o: Op) =>
	handlePush(
		db,
		{ orgId: ORG, deviceId: device },
		{ ops: [o] },
		{ ...openRules, now: () => 10_000 },
	);

beforeEach(async () => {
	await emptyTestDb(db);
	await db
		.insertInto("orgs")
		.values([
			{ id: ORG, name: "Demo" },
			{ id: OTHER_ORG, name: "Other" },
		])
		.execute();
	await member("Junior", "technician", PHONE);
	dispatcher = await member("Grace", "dispatcher", OFFICE);

	// Both edit the status after seeing the same version: Junior's later edit wins.
	const create = op(OFFICE, 1_000, { title: "Fix pump", status: "assigned" });
	await push(OFFICE, create);
	const seen = { status: create.hlc };
	await push(OFFICE, op(OFFICE, 2_000, { status: "cancelled" }, seen));
	await push(PHONE, op(PHONE, 3_000, { status: "done" }, seen));
});

describe("listConflicts", () => {
	it("says which value won, when and by whom", async () => {
		expect(await listConflicts(db, dispatcher, { open: true })).toEqual([
			{
				id: expect.any(String),
				entityType: "work_order",
				entityId: ORDER,
				title: "Fix pump",
				field: "status",
				reason: "concurrent_edit",
				winner: { value: "done", at: 3_000, by: "Junior" },
				loser: { value: "cancelled", at: 2_000, by: "Grace" },
				detectedAt: expect.any(String),
				reviewedAt: null,
				reviewedBy: null,
			},
		]);
	});

	it("is for dispatchers and admins", async () => {
		const tech = { ...dispatcher, role: "technician" as const };
		await expect(listConflicts(db, tech, { open: true })).rejects.toEqual(
			new ApiError(403, "FORBIDDEN"),
		);
	});

	it("keeps orgs apart", async () => {
		const other = { ...dispatcher, orgId: OTHER_ORG };
		expect(await listConflicts(db, other, { open: false })).toEqual([]);
	});
});

describe("reviewConflict", () => {
	it("records who reviewed it and drops it from the open list", async () => {
		const [conflict] = await listConflicts(db, dispatcher, { open: true });
		await reviewConflict(db, dispatcher, conflict?.id ?? "", 20_000);

		expect(await listConflicts(db, dispatcher, { open: true })).toEqual([]);
		const [reviewed] = await listConflicts(db, dispatcher, { open: false });
		expect(reviewed).toMatchObject({
			reviewedBy: "Grace",
			reviewedAt: new Date(20_000).toISOString(),
		});
	});

	it("does not reach another org's conflicts", async () => {
		const [conflict] = await listConflicts(db, dispatcher, { open: true });
		const other = { ...dispatcher, orgId: OTHER_ORG };
		await expect(
			reviewConflict(db, other, conflict?.id ?? "", 20_000),
		).rejects.toEqual(new ApiError(404, "NOT_FOUND"));
	});
});
