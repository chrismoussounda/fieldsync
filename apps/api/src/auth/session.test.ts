import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { ApiError } from "../errors.ts";
import {
	ACCESS_TTL_MS,
	type AuthConfig,
	authenticate,
	login,
	REUSE_GRACE_MS,
	refresh,
} from "./session.ts";
import { createUser } from "./users.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const TABLET = "0b1b2c3d-0000-4000-8000-000000000002";

let db: Kysely<Database>;
let time: number;
const config: AuthConfig = {
	secret: new TextEncoder().encode("a test secret of at least 32 bytes"),
	now: () => time,
};

beforeAll(async () => {
	db = await createTestDb();
});

beforeEach(async () => {
	time = Date.parse("2026-11-19T08:00:00Z");
	await emptyTestDb(db);
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
	await createUser(db, {
		orgId: ORG,
		email: "Tech@Example.com",
		name: "Tech",
		password: "correct horse",
		role: "technician",
	});
});

afterAll(() => db.destroy());

function signIn(deviceId = PHONE, password = "correct horse") {
	return login(db, config, {
		email: "tech@example.com ",
		password,
		deviceId,
		deviceName: "Phone",
	});
}

async function failure(promise: Promise<unknown>): Promise<string> {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(ApiError);
	return (error as ApiError).code;
}

describe("login", () => {
	it("stores only an argon2id hash of the password", async () => {
		const user = await db
			.selectFrom("users")
			.select("password_hash")
			.executeTakeFirstOrThrow();
		expect(user.password_hash).toMatch(/^\$argon2id\$/);
	});

	it("registers the device and returns a session", async () => {
		const session = await signIn();
		expect(session.user).toMatchObject({ name: "Tech", role: "technician" });
		const device = await db
			.selectFrom("devices")
			.selectAll()
			.executeTakeFirstOrThrow();
		expect(device).toMatchObject({ id: PHONE, name: "Phone", org_id: ORG });
	});

	it("signs the same device in again", async () => {
		await signIn();
		await expect(signIn()).resolves.toBeDefined();
	});

	it("refuses a wrong password or an unknown email alike", async () => {
		expect(await failure(signIn(PHONE, "wrong"))).toBe("UNAUTHORIZED");
		expect(
			await failure(
				login(db, config, {
					email: "nobody@example.com",
					password: "correct horse",
					deviceId: PHONE,
					deviceName: "Phone",
				}),
			),
		).toBe("UNAUTHORIZED");
	});

	it("refuses a device whose clock node is taken in the org", async () => {
		await signIn();
		const sameNode = "0a1b2c3d-ffff-4000-8000-000000000009";
		expect(await failure(signIn(sameNode))).toBe("DEVICE_TAKEN");
	});

	it("refuses a revoked device", async () => {
		await signIn();
		await db.updateTable("devices").set({ revoked_at: new Date() }).execute();
		expect(await failure(signIn())).toBe("DEVICE_REVOKED");
	});
});

describe("access token", () => {
	it("identifies the user and the device", async () => {
		const { accessToken, user } = await signIn();
		expect(await authenticate(db, config, accessToken)).toEqual({
			orgId: ORG,
			userId: user.id,
			deviceId: PHONE,
			role: "technician",
		});
	});

	it("expires", async () => {
		const { accessToken } = await signIn();
		time += ACCESS_TTL_MS + 1000;
		expect(await failure(authenticate(db, config, accessToken))).toBe(
			"UNAUTHORIZED",
		);
	});

	it("refuses a token signed with another secret", async () => {
		const { accessToken } = await signIn();
		const other = {
			...config,
			secret: new TextEncoder().encode("x".repeat(32)),
		};
		expect(await failure(authenticate(db, other, accessToken))).toBe(
			"UNAUTHORIZED",
		);
	});

	it("stops working as soon as the device is revoked", async () => {
		const { accessToken } = await signIn();
		await db.updateTable("devices").set({ revoked_at: new Date() }).execute();
		expect(await failure(authenticate(db, config, accessToken))).toBe(
			"DEVICE_REVOKED",
		);
	});
});

describe("refresh", () => {
	it("rotates the refresh token", async () => {
		const first = await signIn();
		const second = await refresh(db, config, first.refreshToken);
		expect(second.refreshToken).not.toBe(first.refreshToken);
		await expect(
			refresh(db, config, second.refreshToken),
		).resolves.toBeDefined();
	});

	it("revokes the whole family when a used token comes back", async () => {
		const first = await signIn();
		const second = await refresh(db, config, first.refreshToken);
		time += REUSE_GRACE_MS + 1000;
		expect(await failure(refresh(db, config, first.refreshToken))).toBe(
			"UNAUTHORIZED",
		);
		expect(await failure(refresh(db, config, second.refreshToken))).toBe(
			"UNAUTHORIZED",
		);
	});

	it("forgives a retry whose response was lost", async () => {
		const first = await signIn();
		const lost = await refresh(db, config, first.refreshToken);
		time += 1000;
		const retried = await refresh(db, config, first.refreshToken);
		expect(await failure(refresh(db, config, lost.refreshToken))).toBe(
			"UNAUTHORIZED",
		);
		await expect(
			refresh(db, config, retried.refreshToken),
		).resolves.toBeDefined();
	});

	it("lets only one of two concurrent refreshes rotate", async () => {
		const { refreshToken } = await signIn();
		const results = await Promise.allSettled([
			refresh(db, config, refreshToken),
			refresh(db, config, refreshToken),
		]);
		const tokens = results.flatMap((r) =>
			r.status === "fulfilled" ? [r.value.refreshToken] : [],
		);
		const live = await db
			.selectFrom("refresh_tokens")
			.select("hash")
			.where("used_at", "is", null)
			.execute();
		expect(tokens.length).toBeGreaterThan(0);
		expect(live).toHaveLength(1);
	});

	it("expires after 30 days without use", async () => {
		const { refreshToken } = await signIn();
		time += 31 * 24 * 60 * 60 * 1000;
		expect(await failure(refresh(db, config, refreshToken))).toBe(
			"UNAUTHORIZED",
		);
	});

	it("refuses a revoked device", async () => {
		const { refreshToken } = await signIn();
		await db.updateTable("devices").set({ revoked_at: new Date() }).execute();
		expect(await failure(refresh(db, config, refreshToken))).toBe(
			"DEVICE_REVOKED",
		);
	});

	it("keeps devices of the same user apart", async () => {
		const phone = await signIn(PHONE);
		await signIn(TABLET);
		const next = await refresh(db, config, phone.refreshToken);
		expect((await authenticate(db, config, next.accessToken)).deviceId).toBe(
			PHONE,
		);
	});
});
