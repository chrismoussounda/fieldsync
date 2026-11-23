import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Kysely, Transaction } from "kysely";
import { type AuthConfig, openSession, type Session } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";
import { PEOPLE, type Person, seedOrders } from "./demo.ts";
import { ApiError } from "./errors.ts";

export const WORKSPACE_TTL_MS = 24 * 60 * 60 * 1000;
// With the photo limit, keeps the demo well inside the database's free 1 GB.
export const MAX_WORKSPACES = 100;

export type DemoSession = Session & {
	demo: { key: string; person: Person; expiresAt: string };
};

type Visitor = { person: Person; deviceId: string; deviceName: string };

/** Creates a visitor's own copy of the demo, and signs them in to it. */
export async function createWorkspace(
	db: Kysely<Database>,
	config: AuthConfig,
	visitor: Visitor,
): Promise<DemoSession> {
	const now = config.now();
	await deleteExpiredWorkspaces(db, now);
	const { count } = await db
		.selectFrom("orgs")
		.select((eb) => eb.fn.countAll().as("count"))
		.where("demo_expires_at", "is not", null)
		.executeTakeFirstOrThrow();
	if (Number(count) >= MAX_WORKSPACES) throw new ApiError(503, "DEMO_FULL");

	const orgId = randomUUID();
	const key = randomBytes(18).toString("base64url");
	const passwordHash = await unusablePassword();
	const ids = new Map<Person, string>();
	await db.transaction().execute(async (tx) => {
		await tx
			.insertInto("orgs")
			.values({
				id: orgId,
				name: "Demo",
				demo_key_hash: sha256(key),
				demo_expires_at: new Date(now + WORKSPACE_TTL_MS),
			})
			.execute();
		for (const person of Object.keys(PEOPLE) as Person[]) {
			const id = randomUUID();
			ids.set(person, id);
			await tx
				.insertInto("users")
				.values({
					id,
					org_id: orgId,
					email: emailOf(person, orgId),
					...PEOPLE[person],
					password_hash: passwordHash,
				})
				.execute();
		}
	});
	await seedOrders(db, orgId, ids, now);
	return enterWorkspace(db, config, { ...visitor, key });
}

/** Signs a visitor in to an existing copy of the demo, as one of its people. */
export async function enterWorkspace(
	db: Kysely<Database>,
	config: AuthConfig,
	{ key, person, deviceId, deviceName }: Visitor & { key: string },
): Promise<DemoSession> {
	const org = await db
		.selectFrom("orgs")
		.select(["id", "demo_expires_at"])
		.where("demo_key_hash", "=", sha256(key))
		.where("demo_expires_at", ">", new Date(config.now()))
		.executeTakeFirst();
	if (!org?.demo_expires_at) throw new ApiError(404, "DEMO_ENDED");
	const user = await db
		.selectFrom("users")
		.select(["id", "org_id", "name", "role", "disabled_at"])
		.where("org_id", "=", org.id)
		.where("email", "=", emailOf(person, org.id))
		.executeTakeFirstOrThrow();
	if (user.disabled_at) throw new ApiError(403, "ACCOUNT_DISABLED");
	const session = await openSession(db, config, user, deviceId, deviceName);
	return {
		...session,
		demo: { key, person, expiresAt: org.demo_expires_at.toISOString() },
	};
}

export async function deleteExpiredWorkspaces(
	db: Kysely<Database>,
	now = Date.now(),
): Promise<void> {
	await db.transaction().execute(async (tx) => {
		const expired = await tx
			.selectFrom("orgs")
			.select("id")
			.where("demo_expires_at", "<=", new Date(now))
			// One being written to, or already being deleted, waits for next time.
			.forUpdate()
			.skipLocked()
			.execute();
		for (const { id } of expired) await deleteOrg(tx, id);
	});
}

async function deleteOrg(
	tx: Transaction<Database>,
	orgId: string,
): Promise<void> {
	await tx
		.deleteFrom("refresh_tokens")
		.where("user_id", "in", (eb) =>
			eb.selectFrom("users").select("id").where("org_id", "=", orgId),
		)
		.execute();
	for (const table of [
		"conflicts",
		"photo_files",
		"received_ops",
		"changes",
		"entities",
		"devices",
		"users",
	] as const) {
		await tx.deleteFrom(table).where("org_id", "=", orgId).execute();
	}
	await tx.deleteFrom("orgs").where("id", "=", orgId).execute();
}

const emailOf = (person: Person, orgId: string) =>
	`${person}+${orgId}@fieldsync.demo`;

// Nobody signs in to a workspace with a password; hashed once, as it is slow.
let unusable: Promise<string> | undefined;
function unusablePassword(): Promise<string> {
	unusable ??= hash(randomBytes(32).toString("base64url"));
	return unusable;
}

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}
