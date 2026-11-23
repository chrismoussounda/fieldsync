import { isDeleted } from "@fieldsync/merge";
import { canManage, PHOTO } from "@fieldsync/work-orders";
import type { Kysely } from "kysely";
import { audienceOf, WORK_ORDER_SCOPING } from "./auth/policy.ts";
import type { Principal } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";
import { checkRoomForPhoto } from "./demo-limits.ts";
import { ApiError } from "./errors.ts";
import { readEntity } from "./sync/records.ts";
import { canSee } from "./sync/scope.ts";

/** A photo's record, if this user's devices sync it. */
async function visiblePhoto(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
) {
	const photo = await readEntity(db, principal.orgId, PHOTO, id);
	const visible =
		photo &&
		!isDeleted(photo) &&
		(await canSee(
			db,
			principal.orgId,
			audienceOf(principal),
			WORK_ORDER_SCOPING,
			PHOTO,
			id,
			photo,
		));
	if (!visible) throw new ApiError(404, "NOT_FOUND");
	return photo;
}

/**
 * Stores the image of a photo whose record already synced. Sending it again
 * changes nothing, so a device can retry after a lost answer.
 */
export async function storePhotoFile(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	contentType: string,
	bytes: Uint8Array,
): Promise<void> {
	const photo = await visiblePhoto(db, principal, id);
	if (!canManage(principal.role) && photo.fields.takenBy !== principal.userId) {
		throw new ApiError(403, "FORBIDDEN");
	}
	// The record says what the image is; another file cannot take its place.
	if (
		contentType !== photo.fields.contentType ||
		bytes.length !== photo.fields.size
	) {
		throw new ApiError(400, "FILE_MISMATCH");
	}
	await checkRoomForPhoto(db, principal.orgId, id, bytes.length);
	await db
		.insertInto("photo_files")
		.values({
			org_id: principal.orgId,
			id,
			content_type: contentType,
			bytes,
		})
		.onConflict((oc) => oc.columns(["org_id", "id"]).doNothing())
		.execute();
}

export async function readPhotoFile(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
): Promise<{ contentType: string; bytes: Uint8Array }> {
	await visiblePhoto(db, principal, id);
	const file = await db
		.selectFrom("photo_files")
		.select(["content_type", "bytes"])
		.where("org_id", "=", principal.orgId)
		.where("id", "=", id)
		.executeTakeFirst();
	// The record synced, but its device has not sent the image yet.
	if (!file) throw new ApiError(404, "PHOTO_PENDING");
	return { contentType: file.content_type, bytes: file.bytes };
}
