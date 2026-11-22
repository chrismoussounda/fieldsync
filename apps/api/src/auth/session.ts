import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { jwtVerify, SignJWT } from "jose";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { Database, Role } from "../db/schema.ts";
import { ApiError, isUniqueViolation } from "../errors.ts";
import { normalizeEmail } from "./users.ts";

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// A device on a bad network may resend a refresh whose answer it never got.
export const REUSE_GRACE_MS = 60 * 1000;

export type AuthConfig = { secret: Uint8Array; now: () => number };

export type Principal = {
	orgId: string;
	userId: string;
	deviceId: string;
	role: Role;
};

export type Session = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	user: { id: string; name: string; role: Role };
};

export type LoginInput = {
	email: string;
	password: string;
	deviceId: string;
	deviceName: string;
};

const Claims = z.object({
	sub: z.string(),
	org: z.string(),
	dev: z.string(),
	role: z.enum(["technician", "dispatcher", "admin"]),
});

const unauthorized = () => new ApiError(401, "UNAUTHORIZED");
const revoked = () => new ApiError(401, "DEVICE_REVOKED");

// Checked when the email is unknown, so both failures take as long.
let dummyHash: Promise<string> | undefined;

export async function login(
	db: Kysely<Database>,
	config: AuthConfig,
	{ email, password, deviceId, deviceName }: LoginInput,
): Promise<Session> {
	const user = await db
		.selectFrom("users")
		.select(["id", "org_id", "name", "role", "password_hash", "disabled_at"])
		.where("email", "=", normalizeEmail(email))
		.executeTakeFirst();
	dummyHash ??= hash(randomUUID());
	const valid = await verify(
		user?.password_hash ?? (await dummyHash),
		password,
	);
	if (!user || !valid) throw unauthorized();
	// Said only to someone who knows the password.
	if (user.disabled_at) throw new ApiError(403, "ACCOUNT_DISABLED");

	return openSession(db, config, user, deviceId, deviceName);
}

/** Registers the device to the user, once, and issues the session's tokens. */
export async function openSession(
	db: Kysely<Database>,
	config: AuthConfig,
	user: { id: string; org_id: string; name: string; role: Role },
	deviceId: string,
	deviceName: string,
): Promise<Session> {
	const device = await db
		.selectFrom("devices")
		.select(["user_id", "revoked_at"])
		.where("id", "=", deviceId)
		.executeTakeFirst();
	if (device && device.user_id !== user.id) {
		throw new ApiError(409, "DEVICE_TAKEN");
	}
	if (device?.revoked_at) throw revoked();
	if (!device) {
		try {
			await db
				.insertInto("devices")
				.values({
					id: deviceId,
					org_id: user.org_id,
					user_id: user.id,
					name: deviceName,
				})
				.execute();
		} catch (error) {
			if (isUniqueViolation(error)) throw new ApiError(409, "DEVICE_TAKEN");
			throw error;
		}
	}

	return db.transaction().execute((tx) =>
		issue(tx, config, {
			principal: {
				orgId: user.org_id,
				userId: user.id,
				deviceId,
				role: user.role,
			},
			name: user.name,
			familyId: randomUUID(),
		}),
	);
}

export async function refresh(
	db: Kysely<Database>,
	config: AuthConfig,
	refreshToken: string,
): Promise<Session> {
	// Errors are returned, not thrown, so revoking a family still commits.
	const result = await db.transaction().execute(async (tx) => {
		const token = await rotate(tx, sha256(refreshToken), config.now());
		if (!token) return unauthorized();

		const owner = await tx
			.selectFrom("devices")
			.innerJoin("users", "users.id", "devices.user_id")
			.select([
				"users.id",
				"users.org_id",
				"users.name",
				"users.role",
				"devices.revoked_at",
			])
			.where("devices.id", "=", token.device_id)
			.executeTakeFirstOrThrow();
		if (owner.revoked_at) return revoked();

		return issue(tx, config, {
			principal: {
				orgId: owner.org_id,
				userId: owner.id,
				deviceId: token.device_id,
				role: owner.role,
			},
			name: owner.name,
			familyId: token.family_id,
		});
	});
	if (result instanceof ApiError) throw result;
	return result;
}

/** Marks a refresh token used; null when it must be refused. */
async function rotate(
	tx: Transaction<Database>,
	hashed: string,
	at: number,
): Promise<{ family_id: string; device_id: string } | null> {
	const now = new Date(at);
	// Checked and marked in one statement, so two concurrent refreshes cannot
	// both rotate the same token.
	const fresh = await tx
		.updateTable("refresh_tokens")
		.set({ used_at: now })
		.where("hash", "=", hashed)
		.where("used_at", "is", null)
		.where("expires_at", ">", now)
		.returning(["family_id", "device_id"])
		.executeTakeFirst();
	if (fresh) return fresh;

	const used = await tx
		.selectFrom("refresh_tokens")
		.select(["family_id", "device_id", "used_at", "expires_at"])
		.where("hash", "=", hashed)
		.executeTakeFirst();
	if (!used?.used_at || used.expires_at <= now) return null;

	const family = tx
		.deleteFrom("refresh_tokens")
		.where("family_id", "=", used.family_id);
	if (at - used.used_at.getTime() > REUSE_GRACE_MS) {
		// An old token came back: someone may have copied it.
		await family.execute();
		return null;
	}
	// A retry: the token issued in between is replaced by a new one.
	await family.where("used_at", "is", null).execute();
	return used;
}

/** Checks an access token, and that its device has not been revoked since. */
export async function authenticate(
	db: Kysely<Database>,
	config: AuthConfig,
	accessToken: string,
): Promise<Principal> {
	let claims: z.infer<typeof Claims>;
	try {
		const { payload } = await jwtVerify(accessToken, config.secret, {
			algorithms: ["HS256"],
			currentDate: new Date(config.now()),
		});
		claims = Claims.parse(payload);
	} catch {
		throw unauthorized();
	}

	const seen = await db
		.updateTable("devices")
		.set({ last_seen_at: new Date(config.now()) })
		.where("id", "=", claims.dev)
		.where("revoked_at", "is", null)
		.returning("id")
		.executeTakeFirst();
	if (!seen) throw revoked();

	return {
		orgId: claims.org,
		userId: claims.sub,
		deviceId: claims.dev,
		role: claims.role,
	};
}

async function issue(
	tx: Transaction<Database>,
	config: AuthConfig,
	{
		principal,
		name,
		familyId,
	}: { principal: Principal; name: string; familyId: string },
): Promise<Session> {
	const now = config.now();
	const refreshToken = randomBytes(32).toString("base64url");
	await tx
		.insertInto("refresh_tokens")
		.values({
			hash: sha256(refreshToken),
			family_id: familyId,
			user_id: principal.userId,
			device_id: principal.deviceId,
			expires_at: new Date(now + REFRESH_TTL_MS),
		})
		.execute();

	const accessToken = await new SignJWT({
		org: principal.orgId,
		dev: principal.deviceId,
		role: principal.role,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(principal.userId)
		.setIssuedAt(Math.floor(now / 1000))
		.setExpirationTime(Math.floor((now + ACCESS_TTL_MS) / 1000))
		.sign(config.secret);

	return {
		accessToken,
		refreshToken,
		expiresIn: ACCESS_TTL_MS / 1000,
		user: { id: principal.userId, name, role: principal.role },
	};
}

function sha256(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
