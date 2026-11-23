import { type Kysely, sql } from "kysely";
import type { Database } from "./db/schema.ts";
import { ApiError } from "./errors.ts";

export const MAX_WORKSPACE_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_WORKSPACE_USERS = 20;

/** Refuses a photo a visitor's demo has no room for; other orgs have no limit. */
export async function checkRoomForPhoto(
	db: Kysely<Database>,
	orgId: string,
	photoId: string,
	size: number,
): Promise<void> {
	if (!(await isWorkspace(db, orgId))) return;
	const { used } = await db
		.selectFrom("photo_files")
		.select(sql<string>`coalesce(sum(length(bytes)), 0)`.as("used"))
		.where("org_id", "=", orgId)
		// Sending the same photo again takes no more room.
		.where("id", "!=", photoId)
		.executeTakeFirstOrThrow();
	if (Number(used) + size > MAX_WORKSPACE_PHOTO_BYTES) {
		throw new ApiError(413, "DEMO_LIMIT");
	}
}

export async function checkRoomForUser(
	db: Kysely<Database>,
	orgId: string,
): Promise<void> {
	if (!(await isWorkspace(db, orgId))) return;
	const { count } = await db
		.selectFrom("users")
		.select((eb) => eb.fn.countAll().as("count"))
		.where("org_id", "=", orgId)
		.executeTakeFirstOrThrow();
	if (Number(count) >= MAX_WORKSPACE_USERS) {
		throw new ApiError(403, "DEMO_LIMIT");
	}
}

async function isWorkspace(
	db: Kysely<Database>,
	orgId: string,
): Promise<boolean> {
	const org = await db
		.selectFrom("orgs")
		.select("id")
		.where("id", "=", orgId)
		.where("demo_expires_at", "is not", null)
		.executeTakeFirst();
	return org !== undefined;
}
