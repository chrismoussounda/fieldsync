import { type Kysely, sql } from "kysely";
import { NO_MIGRATIONS } from "kysely/migration";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateToLatest, migrator } from "./migrate.ts";
import type { Database } from "./schema.ts";
import { createTestDb, emptyTestDb } from "./testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const DEVICE = "0a1b2c3d-0000-4000-8000-000000000001";
const ENTITY = "00000000-0000-4000-8000-0000000000aa";

let db: Kysely<Database>;

beforeAll(async () => {
	db = await createTestDb();
});

beforeEach(async () => {
	await emptyTestDb(db);
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
});

afterAll(() => db.destroy());

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
	it("create the sync and auth tables", async () => {
		expect(await tables()).toEqual([
			"changes",
			"conflicts",
			"devices",
			"entities",
			"orgs",
			"received_ops",
			"refresh_tokens",
			"users",
		]);
	});

	it("refuse two devices of an org sharing a clock node", async () => {
		const user = "00000000-0000-4000-8000-0000000000b1";
		await db
			.insertInto("users")
			.values({
				id: user,
				org_id: ORG,
				email: "tech@example.com",
				name: "Tech",
				password_hash: "x",
				role: "technician",
			})
			.execute();
		const device = (id: string) => ({
			id,
			org_id: ORG,
			user_id: user,
			name: "Phone",
		});
		await db.insertInto("devices").values(device(DEVICE)).execute();
		await expect(
			db
				.insertInto("devices")
				.values(device("0a1b2c3d-0000-4000-8000-000000000002"))
				.execute(),
		).rejects.toThrow();
	});

	it("roll back cleanly", async () => {
		await migrator(db as Kysely<unknown>).migrateTo(NO_MIGRATIONS);
		expect(await tables()).toEqual([]);
		await migrateToLatest(db as Kysely<unknown>);
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

	it("file earlier changes under the order's current assignee", async () => {
		await migrator(db as Kysely<unknown>).migrateTo("006_changes_by_entity");
		await sql`
			insert into entities (org_id, type, id, fields, clocks, created_hlc, updated_seq)
			values (${ORG}, 'work_order', ${ENTITY}, ${JSON.stringify({ assigneeId: "junior" })},
				'{}', '0000000000001-0000-0a1b2c3d', 1)
		`.execute(db);
		await db
			.insertInto("changes")
			.values(change(1, "00000000-0000-7000-8000-000000000003"))
			.execute();
		await migrateToLatest(db as Kysely<unknown>);

		const row = await db
			.selectFrom("changes")
			.select(["scope_before", "scope_after"])
			.executeTakeFirstOrThrow();
		expect(row).toEqual({ scope_before: "junior", scope_after: "junior" });
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
