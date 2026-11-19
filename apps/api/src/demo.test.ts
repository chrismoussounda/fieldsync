import type { Kysely } from "kysely";
import { afterAll, beforeAll, expect, it } from "vitest";
import { login } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";
import { createTestDb } from "./db/testing.ts";
import { DEMO_ORG, seedDemo } from "./demo.ts";

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
