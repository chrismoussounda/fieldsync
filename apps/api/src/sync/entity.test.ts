import { encode } from "@fieldsync/hlc";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { handleGetEntity } from "./entity.ts";
import { type Auth, handlePush } from "./push.ts";
import { allowAll } from "./testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const NOW = 1_000_000;

const phone: Auth = { orgId: ORG, deviceId: PHONE };
const request = { entityType: "work_order", entityId: ORDER };

let db: Kysely<Database>;

beforeAll(async () => {
	db = await createTestDb();
});

beforeEach(async () => {
	await emptyTestDb(db);
	await db
		.insertInto("orgs")
		.values([
			{ id: ORG, name: "Demo" },
			{ id: OTHER_ORG, name: "Other" },
		])
		.execute();
});

afterAll(() => db.destroy());

it("returns the current state of a record", async () => {
	const hlc = encode({ wall: 1, counter: 0, node: "0a1b2c3d" });
	await handlePush(
		db,
		phone,
		{
			ops: [
				{
					opId: "00000000-0000-7000-8000-000000000001",
					deviceId: PHONE,
					...request,
					kind: "upsert",
					patch: { status: "assigned" },
					base: {},
					hlc,
					clientVersion: "0.1.0",
				},
			],
		},
		{ authorize: allowAll },
	);

	expect(await handleGetEntity(db, phone, request, () => NOW)).toEqual({
		entity: {
			fields: { status: "assigned" },
			clocks: { status: hlc },
			createdHlc: hlc,
			deletedHlc: null,
			restoredHlc: null,
		},
		serverTime: NOW,
	});
});

it("returns null for a record the organisation does not have", async () => {
	const other = { orgId: OTHER_ORG, deviceId: PHONE };
	expect((await handleGetEntity(db, other, request)).entity).toBeNull();
});
