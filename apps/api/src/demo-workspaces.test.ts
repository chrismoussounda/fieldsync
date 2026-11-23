import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { revokeDevice } from "./auth/devices.ts";
import {
	type AuthConfig,
	authenticate,
	login,
	refresh,
} from "./auth/session.ts";
import { addUser, setActive } from "./auth/team.ts";
import type { Database } from "./db/schema.ts";
import { createTestDb, emptyTestDb } from "./db/testing.ts";
import { DEMO_ORG, type Person, seedDemo } from "./demo.ts";
import {
	checkRoomForPhoto,
	MAX_WORKSPACE_PHOTO_BYTES,
	MAX_WORKSPACE_USERS,
} from "./demo-limits.ts";
import {
	createWorkspace,
	deleteExpiredWorkspaces,
	enterWorkspace,
	MAX_WORKSPACES,
	WORKSPACE_TTL_MS,
} from "./demo-workspaces.ts";

let db: Kysely<Database>;
let time: number;
const config: AuthConfig = {
	secret: new TextEncoder().encode("x".repeat(32)),
	now: () => time,
};

beforeAll(async () => {
	db = await createTestDb();
});
beforeEach(async () => {
	await emptyTestDb(db);
	time = Date.now();
});
afterAll(() => db.destroy());

const visitor = (person: Person) => ({
	person,
	deviceId: crypto.randomUUID(),
	deviceName: "Visitor",
});
const create = (person: Person = "dispatch") =>
	createWorkspace(db, config, visitor(person));
const enter = (key: string, person: Person) =>
	enterWorkspace(db, config, { ...visitor(person), key });
const who = (session: { accessToken: string }) =>
	authenticate(db, config, session.accessToken);
const countIn = async (
	table: "entities" | "users" | "devices" | "orgs",
): Promise<number> => {
	const { count } = await db
		.selectFrom(table)
		.select((eb) => eb.fn.countAll().as("count"))
		.executeTakeFirstOrThrow();
	return Number(count);
};

describe("a visitor's own demo", () => {
	it("starts with its own people and jobs, apart from every other", async () => {
		const mine = await create("admin");
		const theirs = await create("admin");
		expect(mine.user).toMatchObject({ name: "Ange Moukala", role: "admin" });

		const { orgId } = await who(mine);
		expect((await who(theirs)).orgId).not.toBe(orgId);
		const jobs = await db
			.selectFrom("entities")
			.select("fields")
			.where("org_id", "=", orgId)
			.where("type", "=", "work_order")
			.execute();
		expect(jobs).toHaveLength(5);
		const ids = await db
			.selectFrom("users")
			.select("id")
			.where("org_id", "=", orgId)
			.execute();
		const assignees = jobs.flatMap((j) => j.fields.assigneeId ?? []);
		expect(assignees).toHaveLength(4);
		for (const id of assignees) expect(ids.map((u) => u.id)).toContain(id);
	});

	it("is entered as any of its people, with its key only", async () => {
		const { demo, ...admin } = await create("admin");
		const { orgId } = await who(admin);
		for (const [person, role] of [
			["dispatch", "dispatcher"],
			["junior", "technician"],
			["merveille", "technician"],
		] as const) {
			const session = await enter(demo.key, person);
			expect(session.user.role).toBe(role);
			expect((await who(session)).orgId).toBe(orgId);
		}
		await expect(enter("not the key", "admin")).rejects.toThrow("DEMO_ENDED");
		const org = await db
			.selectFrom("orgs")
			.selectAll()
			.executeTakeFirstOrThrow();
		expect(JSON.stringify(org)).not.toContain(demo.key);
	});

	it("lets its admin lock people and devices out", async () => {
		const { demo, ...admin } = await create("admin");
		const principal = await who(admin);
		const junior = await enter(demo.key, "junior");
		const device = (await who(junior)).deviceId;
		await revokeDevice(db, principal, device, time);
		await expect(who(junior)).rejects.toThrow("DEVICE_REVOKED");
		// Reloaded, it asks for a new session instead.
		await expect(refresh(db, config, junior.refreshToken)).rejects.toThrow(
			"DEVICE_REVOKED",
		);
		await setActive(db, principal, junior.user.id, false, time);
		await expect(enter(demo.key, "junior")).rejects.toThrow("ACCOUNT_DISABLED");
	});

	it("says when it ends to someone its admin added, who signs in by email", async () => {
		const principal = await who(await create("admin"));
		const password = "long enough password";
		const email = "new@fieldsync.demo";
		await addUser(db, principal, {
			email,
			name: "New",
			role: "technician",
			password,
		});
		const signIn = () =>
			login(db, config, {
				email,
				password,
				deviceId: crypto.randomUUID(),
				deviceName: "Phone",
			});
		const ends = new Date(time + WORKSPACE_TTL_MS).toISOString();
		expect((await signIn()).demo).toEqual({ expiresAt: ends });
		time += WORKSPACE_TTL_MS;
		await expect(signIn()).rejects.toThrow("DEMO_ENDED");
	});

	it("is gone once expired, leaving the others and the shared demo", async () => {
		await seedDemo(db, "demo password");
		const shared = await countIn("entities");
		const old = await create();
		time += WORKSPACE_TTL_MS / 2;
		const recent = await create();
		time += WORKSPACE_TTL_MS / 2;

		await expect(enter(old.demo.key, "junior")).rejects.toThrow("DEMO_ENDED");
		await deleteExpiredWorkspaces(db, time);
		expect(await countIn("orgs")).toBe(2);
		expect(await countIn("entities")).toBe(shared * 2);
		expect(await countIn("devices")).toBe(1);
		const people = await db
			.selectFrom("users")
			.select("id")
			.where("org_id", "=", DEMO_ORG)
			.execute();
		expect(people).toHaveLength(4);
		expect((await enter(recent.demo.key, "junior")).user.name).toBe(
			"Junior Nkounkou",
		);
		// Signed out, not told an admin locked them out.
		await expect(refresh(db, config, old.refreshToken)).rejects.toThrow(
			"UNAUTHORIZED",
		);
	});

	it("signs a device out, rather than locking it out, when deleted under it", async () => {
		const session = await create();
		await deleteExpiredWorkspaces(db, time + WORKSPACE_TTL_MS);
		await expect(who(session)).rejects.toThrow("UNAUTHORIZED");
	});
});

describe("demo limits", () => {
	it("stops creating demos when there are too many, until some expire", async () => {
		await db
			.insertInto("orgs")
			.values(
				Array.from({ length: MAX_WORKSPACES }, (_, i) => ({
					id: crypto.randomUUID(),
					name: "Demo",
					demo_key_hash: `full-${i}`,
					demo_expires_at: new Date(time + 1000),
				})),
			)
			.execute();
		await expect(create()).rejects.toThrow("DEMO_FULL");
		time += 1000;
		expect((await create()).user.role).toBe("dispatcher");
		expect(await countIn("orgs")).toBe(1);
	});

	it("caps the photos and people of a visitor's demo, not of other orgs", async () => {
		await seedDemo(db, "demo password");
		const admin = await create("admin");
		const principal = await who(admin);
		const room = (orgId: string, id: string, size: number) =>
			checkRoomForPhoto(db, orgId, id, size);
		const photo = crypto.randomUUID();
		await db
			.insertInto("photo_files")
			.values({
				org_id: principal.orgId,
				id: photo,
				content_type: "image/jpeg",
				bytes: new Uint8Array(1000),
			})
			.execute();
		const rest = MAX_WORKSPACE_PHOTO_BYTES - 1000;
		await room(principal.orgId, crypto.randomUUID(), rest);
		await expect(
			room(principal.orgId, crypto.randomUUID(), rest + 1),
		).rejects.toThrow("DEMO_LIMIT");
		// The same photo, sent again after a lost answer.
		await room(principal.orgId, photo, MAX_WORKSPACE_PHOTO_BYTES);
		await room(DEMO_ORG, crypto.randomUUID(), MAX_WORKSPACE_PHOTO_BYTES + 1);

		await db
			.insertInto("users")
			.values(
				Array.from({ length: MAX_WORKSPACE_USERS - 4 }, (_, i) => ({
					id: crypto.randomUUID(),
					org_id: principal.orgId,
					email: `extra-${i}@fieldsync.demo`,
					name: "Extra",
					role: "technician" as const,
					password_hash: "unused",
				})),
			)
			.execute();
		await expect(
			addUser(db, principal, {
				email: "one.more@fieldsync.demo",
				name: "One More",
				role: "technician",
				password: "long enough password",
			}),
		).rejects.toThrow("DEMO_LIMIT");
	});
});
