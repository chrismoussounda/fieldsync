import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { ApiError } from "../errors.ts";
import {
	type AuthConfig,
	authenticate,
	login,
	type Principal,
} from "./session.ts";
import {
	addUser,
	changePassword,
	listMembers,
	resetPassword,
	setActive,
	updateUser,
} from "./team.ts";
import { createUser } from "./users.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const LAPTOP = "1a1b2c3d-0000-4000-8000-000000000002";
const PASSWORD = "correct horse battery";

let db: Kysely<Database>;
let admin: Principal;
let techId: string;
const config: AuthConfig = {
	secret: new TextEncoder().encode("a test secret of at least 32 bytes"),
	now: Date.now,
};

beforeAll(async () => {
	db = await createTestDb();
});

afterAll(() => db.destroy());

beforeEach(async () => {
	await emptyTestDb(db);
	await db
		.insertInto("orgs")
		.values([
			{ id: ORG, name: "Demo" },
			{ id: OTHER_ORG, name: "Other" },
		])
		.execute();
	const adminId = await createUser(db, {
		orgId: ORG,
		email: "admin@example.com",
		name: "Ange",
		password: PASSWORD,
		role: "admin",
	});
	admin = { orgId: ORG, userId: adminId, deviceId: LAPTOP, role: "admin" };
	techId = await createUser(db, {
		orgId: ORG,
		email: "tech@example.com",
		name: "Junior",
		password: PASSWORD,
		role: "technician",
	});
});

const signIn = (email: string, password = PASSWORD, deviceId = PHONE) =>
	login(db, config, { email, password, deviceId, deviceName: "Phone" });

async function failure(promise: Promise<unknown>): Promise<string> {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(ApiError);
	return (error as ApiError).code;
}

describe("listMembers", () => {
	it("shows emails and status to admins only", async () => {
		const forAdmin = await listMembers(db, admin);
		expect(forAdmin.find((m) => m.id === techId)).toEqual({
			id: techId,
			name: "Junior",
			role: "technician",
			active: true,
			email: "tech@example.com",
		});
		const tech = { ...admin, userId: techId, role: "technician" as const };
		expect((await listMembers(db, tech)).find((m) => m.id === techId)).toEqual({
			id: techId,
			name: "Junior",
			role: "technician",
			active: true,
		});
	});
});

describe("addUser", () => {
	it("creates someone who can sign in", async () => {
		await addUser(db, admin, {
			email: " Merveille@Example.com",
			name: "Merveille",
			role: "technician",
			password: PASSWORD,
		});
		expect((await signIn("merveille@example.com")).user.name).toBe("Merveille");
	});

	it("refuses an email already in use", async () => {
		const taken = addUser(db, admin, {
			email: "TECH@example.com",
			name: "Other",
			role: "technician",
			password: PASSWORD,
		});
		expect(await failure(taken)).toBe("EMAIL_TAKEN");
	});

	it("is for admins only", async () => {
		const dispatcher = { ...admin, role: "dispatcher" as const };
		const attempt = addUser(db, dispatcher, {
			email: "x@example.com",
			name: "X",
			role: "admin",
			password: PASSWORD,
		});
		expect(await failure(attempt)).toBe("FORBIDDEN");
	});
});

describe("updateUser", () => {
	it("renames and changes roles", async () => {
		await updateUser(db, admin, techId, {
			name: "Junior N.",
			role: "dispatcher",
		});
		const member = (await listMembers(db, admin)).find((m) => m.id === techId);
		expect(member).toMatchObject({ name: "Junior N.", role: "dispatcher" });
	});

	it("will not let an admin change their own role", async () => {
		const own = updateUser(db, admin, admin.userId, { role: "technician" });
		expect(await failure(own)).toBe("OWN_ACCOUNT");
	});

	it("does not reach another org's users", async () => {
		const other = { ...admin, orgId: OTHER_ORG };
		expect(await failure(updateUser(db, other, techId, { name: "X" }))).toBe(
			"NOT_FOUND",
		);
	});
});

describe("setActive", () => {
	it("locks a disabled user out at once, and lets them back in", async () => {
		const { accessToken } = await signIn("tech@example.com");
		await setActive(db, admin, techId, false, Date.now());

		expect(await failure(authenticate(db, config, accessToken))).toBe(
			"DEVICE_REVOKED",
		);
		const fresh = "2a1b2c3d-0000-4000-8000-000000000003";
		expect(await failure(signIn("tech@example.com", PASSWORD, fresh))).toBe(
			"ACCOUNT_DISABLED",
		);
		const [member] = (await listMembers(db, admin)).filter(
			(m) => m.id === techId,
		);
		expect(member?.active).toBe(false);

		await setActive(db, admin, techId, true, Date.now());
		await expect(
			signIn("tech@example.com", PASSWORD, fresh),
		).resolves.toBeDefined();
	});

	it("will not let an admin disable themselves", async () => {
		expect(
			await failure(setActive(db, admin, admin.userId, false, Date.now())),
		).toBe("OWN_ACCOUNT");
	});
});

describe("passwords", () => {
	it("lets an admin set a new one", async () => {
		await resetPassword(db, admin, techId, "a brand new password");
		expect(await failure(signIn("tech@example.com"))).toBe("UNAUTHORIZED");
		await expect(
			signIn("tech@example.com", "a brand new password"),
		).resolves.toBeDefined();
	});

	it("lets anyone change their own, knowing the current one", async () => {
		const { user } = await signIn("tech@example.com");
		const me = {
			orgId: ORG,
			userId: user.id,
			deviceId: PHONE,
			role: user.role,
		};
		expect(
			await failure(changePassword(db, me, "wrong", "a brand new password")),
		).toBe("WRONG_PASSWORD");
		await changePassword(db, me, PASSWORD, "a brand new password");
		await expect(
			signIn("tech@example.com", "a brand new password"),
		).resolves.toBeDefined();
	});

	it("signs the user out on their other devices", async () => {
		const laptop = await signIn("tech@example.com", PASSWORD, LAPTOP);
		const { user } = await signIn("tech@example.com");
		const me = {
			orgId: ORG,
			userId: user.id,
			deviceId: PHONE,
			role: user.role,
		};
		await changePassword(db, me, PASSWORD, "a brand new password");
		const left = await db
			.selectFrom("refresh_tokens")
			.select("device_id")
			.where("user_id", "=", user.id)
			.execute();
		expect(left.map((t) => t.device_id)).toEqual([PHONE]);
		expect(laptop.refreshToken).toBeDefined();
	});
});
