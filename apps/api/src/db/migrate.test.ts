import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrator } from "./migrate.ts";
import type { Database } from "./schema.ts";
import { createTestDb } from "./testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const DEVICE = "0a1b2c3d-0000-4000-8000-000000000001";
const ENTITY = "00000000-0000-4000-8000-0000000000aa";

let db: Kysely<Database>;

beforeEach(async () => {
	db = await createTestDb();
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
});

afterEach(() => db.destroy());

async function tables(): Promise<string[]> {
	const { rows } = await sql<{ table_name: string }>`
		select table_name from information_schema.tables
		where table_schema = 'public' and table_name not like 'kysely_%'
		order by table_name
	`.execute(db);
	return rows.map((r) => r.table_name);
}

function change(seq: number, opId: string) {
	return {
		org_id: ORG,
		seq,
		op_id: opId,
		device_id: DEVICE,
		entity_type: "work_order",
		entity_id: ENTITY,
		kind: "upsert" as const,
		patch: JSON.stringify({ status: "assigned" }),
		hlc: "0000000000001-0000-0a1b2c3d",
	};
}

describe("migrations", () => {
	it("create the sync tables", async () => {
		expect(await tables()).toEqual([
			"changes",
			"conflicts",
			"entities",
			"orgs",
			"received_ops",
		]);
	});

	it("roll back cleanly", async () => {
		await migrator(db as Kysely<unknown>).migrateDown();
		expect(await tables()).toEqual([]);
	});

	it("start the change counter of an org at zero", async () => {
		const org = await db
			.selectFrom("orgs")
			.select("seq")
			.executeTakeFirstOrThrow();
		expect(Number(org.seq)).toBe(0);
	});

	it("refuse the same operation twice in an org", async () => {
		const opId = "00000000-0000-7000-8000-000000000001";
		await db.insertInto("changes").values(change(1, opId)).execute();
		await expect(
			db.insertInto("changes").values(change(2, opId)).execute(),
		).rejects.toThrow();
	});

	it("refuse an unknown kind of change", async () => {
		const bad = {
			...change(1, "00000000-0000-7000-8000-000000000002"),
			kind: "rename" as never,
		};
		await expect(
			db.insertInto("changes").values(bad).execute(),
		).rejects.toThrow();
	});
});
