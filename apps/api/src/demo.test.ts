import type { Kysely } from "kysely";
import { afterAll, beforeAll, expect, it } from "vitest";
import { login } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";
import { createTestDb } from "./db/testing.ts";
import { DEMO_ORG, resetDemo, seedDemo } from "./demo.ts";
import { handlePull } from "./sync/pull.ts";

let db: Kysely<Database>;

beforeAll(async () => {
	db = await createTestDb();
});

afterAll(() => db.destroy());

it("seeds the demo org once, with users who can sign in", async () => {
	await seedDemo(db, "demo password");
	await seedDemo(db, "another password");

	const users = await db.selectFrom("users").select("role").execute();
	expect(users.map((u) => u.role).sort()).toEqual([
		"admin",
		"dispatcher",
		"technician",
		"technician",
	]);
	const orders = await db.selectFrom("entities").selectAll().execute();
	expect(orders).toHaveLength(5);
	expect(orders.every((o) => o.org_id === DEMO_ORG)).toBe(true);

	const session = await login(
		db,
		{ secret: new TextEncoder().encode("x".repeat(32)), now: Date.now },
		{
			email: "dispatch@fieldsync.demo",
			password: "demo password",
			deviceId: crypto.randomUUID(),
			deviceName: "Laptop",
		},
	);
	expect(session.user.role).toBe("dispatcher");
});

it("files each demo order under its technician, so it reaches their phone", async () => {
	const junior = await db
		.selectFrom("users")
		.select("id")
		.where("email", "=", "junior@fieldsync.demo")
		.executeTakeFirstOrThrow();
	const { changes } = await handlePull(
		db,
		{ orgId: DEMO_ORG, deviceId: crypto.randomUUID() },
		{ cursor: 0, limit: 100 },
		{ audience: junior.id },
	);
	expect(changes.map((c) => c.state?.fields.title).sort()).toEqual([
		"Inspect the generator",
		"Replace the water pump",
	]);
});

it("resets the demo orders under a new epoch and keeps the users", async () => {
	const epoch = async () =>
		(
			await db
				.selectFrom("orgs")
				.select("epoch")
				.where("id", "=", DEMO_ORG)
				.executeTakeFirstOrThrow()
		).epoch;
	const before = await epoch();
	await db.deleteFrom("entities").execute();

	await resetDemo(db);

	expect(await epoch()).not.toBe(before);
	expect(await db.selectFrom("entities").selectAll().execute()).toHaveLength(5);
	expect(await db.selectFrom("users").selectAll().execute()).toHaveLength(4);
	const assigned = await db
		.selectFrom("entities")
		.select((eb) => eb.ref("fields", "->>").key("assigneeId").as("assignee"))
		.execute();
	expect(assigned.filter((a) => a.assignee !== null)).toHaveLength(4);
});
