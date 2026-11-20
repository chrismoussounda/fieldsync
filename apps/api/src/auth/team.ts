import { hash, verify } from "@node-rs/argon2";
import type { Kysely } from "kysely";
import type { Database, Role } from "../db/schema.ts";
import { ApiError, isUniqueViolation } from "../errors.ts";
import { requireAdmin } from "./devices.ts";
import type { Principal } from "./session.ts";
import { createUser, type NewUser } from "./users.ts";

export const MIN_PASSWORD = 10;

export type Member = {
	id: string;
	name: string;
	role: Role;
	/** Disabled users stay listed, so their name still shows on past work. */
	active: boolean;
	/** Admins only. */
	email?: string;
};

export async function listMembers(
	db: Kysely<Database>,
	principal: Principal,
): Promise<Member[]> {
	const rows = await db
		.selectFrom("users")
		.select(["id", "name", "role", "email", "disabled_at"])
		.where("org_id", "=", principal.orgId)
		.orderBy("name")
		.execute();
	const admin = principal.role === "admin";
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		role: r.role,
		active: r.disabled_at === null,
		...(admin ? { email: r.email } : {}),
	}));
}

export async function addUser(
	db: Kysely<Database>,
	principal: Principal,
	user: Omit<NewUser, "orgId">,
): Promise<string> {
	requireAdmin(principal);
	try {
		return await createUser(db, { ...user, orgId: principal.orgId });
	} catch (error) {
		if (isUniqueViolation(error)) throw new ApiError(409, "EMAIL_TAKEN");
		throw error;
	}
}

export async function updateUser(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	changes: { name?: string | undefined; role?: Role | undefined },
): Promise<void> {
	requireAdmin(principal);
	// An admin who demoted themselves could leave the org without one.
	if (changes.role && id === principal.userId) throw ownAccount();
	const values = Object.fromEntries(
		Object.entries(changes).filter(([, v]) => v !== undefined),
	);
	await update(db, principal, id, values);
}

/** Disabling revokes every device of the user, so they are out at once. */
export async function setActive(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	active: boolean,
	now: number,
): Promise<void> {
	requireAdmin(principal);
	if (id === principal.userId) throw ownAccount();
	await db.transaction().execute(async (tx) => {
		await update(tx, principal, id, {
			disabled_at: active ? null : new Date(now),
		});
		if (active) return;
		await tx
			.updateTable("devices")
			.set({ revoked_at: new Date(now) })
			.where("user_id", "=", id)
			.where("revoked_at", "is", null)
			.execute();
		await tx.deleteFrom("refresh_tokens").where("user_id", "=", id).execute();
	});
}

export async function resetPassword(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	password: string,
): Promise<void> {
	requireAdmin(principal);
	await db.transaction().execute(async (tx) => {
		await update(tx, principal, id, { password_hash: await hash(password) });
		await tx.deleteFrom("refresh_tokens").where("user_id", "=", id).execute();
	});
}

/** Signs the user out everywhere but the device they changed it from. */
export async function changePassword(
	db: Kysely<Database>,
	principal: Principal,
	current: string,
	next: string,
): Promise<void> {
	const user = await db
		.selectFrom("users")
		.select("password_hash")
		.where("id", "=", principal.userId)
		.executeTakeFirstOrThrow();
	if (!(await verify(user.password_hash, current))) {
		throw new ApiError(401, "UNAUTHORIZED");
	}
	await db.transaction().execute(async (tx) => {
		await tx
			.updateTable("users")
			.set({ password_hash: await hash(next) })
			.where("id", "=", principal.userId)
			.execute();
		await tx
			.deleteFrom("refresh_tokens")
			.where("user_id", "=", principal.userId)
			.where("device_id", "!=", principal.deviceId)
			.execute();
	});
}

async function update(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	values: Partial<{
		name: string;
		role: Role;
		disabled_at: Date | null;
		password_hash: string;
	}>,
): Promise<void> {
	if (Object.keys(values).length === 0) return;
	const row = await db
		.updateTable("users")
		.set(values)
		.where("id", "=", id)
		.where("org_id", "=", principal.orgId)
		.returning("id")
		.executeTakeFirst();
	if (!row) throw new ApiError(404, "NOT_FOUND");
}

function ownAccount(): ApiError {
	return new ApiError(409, "OWN_ACCOUNT");
}
