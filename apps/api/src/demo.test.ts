import type { Kysely } from "kysely";
import { afterAll, beforeAll, expect, it } from "vitest";
import { login, REFRESH_TTL_MS } from "./auth/session.ts";
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
	await seedDemo(db, "demo password");

	const users = await db.selectFrom("users").select("role").execute();
	expect(users.map((u) => u.role).sort()).toEqual([
		"admin",
		"dispatcher",
		"technician",
		"technician",
	]);
	const records = await db.selectFrom("entities").selectAll().execute();
	expect(records.map((r) => r.type).sort()).toEqual([
		...Array(3).fill("site"),
		...Array(5).fill("work_order"),
	]);
	expect(records.every((r) => r.org_id === DEMO_ORG)).toBe(true);

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

it("gives the demo users a changed password, whatever they set themselves", async () => {
	await seedDemo(db, "a new demo password");
	const signIn = (password: string) =>
		login(
			db,
			{ secret: new TextEncoder().encode("x".repeat(32)), now: Date.now },
			{
				email: "junior@fieldsync.demo",
				password,
				deviceId: crypto.randomUUID(),
				deviceName: "Phone",
			},
		);
	await expect(signIn("demo password")).rejects.toThrow();
	expect((await signIn("a new demo password")).user.role).toBe("technician");
	const records = await db.selectFrom("entities").select("id").execute();
	expect(records).toHaveLength(8);
});

it("files each demo order under its technician, and gives every technician the sites", async () => {
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
	const names = (type: string) =>
		changes
			.filter((c) => c.entityType === type)
			.map((c) => c.state?.fields.title ?? c.state?.fields.name)
			.sort();
	expect(names("work_order")).toEqual([
		"Inspect the generator",
		"Replace the water pump",
	]);
	expect(names("site")).toEqual([
		"Boulangerie La Paix",
		"Clinique de Bacongo",
		"Port Cold Store",
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
	expect(await db.selectFrom("entities").selectAll().execute()).toHaveLength(8);
	expect(await db.selectFrom("users").selectAll().execute()).toHaveLength(4);
	const assigned = await db
		.selectFrom("entities")
		.select((eb) => eb.ref("fields", "->>").key("assigneeId").as("assignee"))
		.execute();
	expect(assigned.filter((a) => a.assignee !== null)).toHaveLength(4);
});

it("forgets a visitor's device once its session has run out, unless revoked", async () => {
	const config = {
		secret: new TextEncoder().encode("x".repeat(32)),
		now: Date.now,
	};
	const visit = async () => {
		const deviceId = crypto.randomUUID();
		await login(db, config, {
			email: "junior@fieldsync.demo",
			password: "a new demo password",
			deviceId,
			deviceName: "Phone",
		});
		return deviceId;
	};
	const visitor = await visit();
	const lost = await visit();
	await db
		.updateTable("devices")
		.set({ revoked_at: new Date() })
		.where("id", "=", lost)
		.execute();
	const kept = async () =>
		(await db.selectFrom("devices").select("id").execute()).map((d) => d.id);

	await resetDemo(db);
	expect(await kept()).toContain(visitor);

	await resetDemo(db, Date.now() + REFRESH_TTL_MS + 60_000);
	expect(await kept()).toEqual([lost]);
});
