import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Kysely } from "kysely";
import type { Database, Role } from "../db/schema.ts";

export type NewUser = {
	orgId: string;
	email: string;
	name: string;
	password: string;
	role: Role;
};

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function createUser(
	db: Kysely<Database>,
	{ orgId, email, name, password, role }: NewUser,
): Promise<string> {
	const id = randomUUID();
	await db
		.insertInto("users")
		.values({
			id,
			org_id: orgId,
			email: normalizeEmail(email),
			name,
			// argon2id with the library defaults (19 MiB, 2 passes).
			password_hash: await hash(password),
			role,
		})
		.execute();
	return id;
}
