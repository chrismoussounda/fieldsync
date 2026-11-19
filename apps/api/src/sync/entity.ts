import type { EntityRequest, EntityResponse } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Auth } from "./push.ts";

export async function handleGetEntity(
	db: Kysely<Database>,
	auth: Auth,
	{ entityType, entityId }: EntityRequest,
	now: () => number = Date.now,
): Promise<EntityResponse> {
	const row = await db
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", auth.orgId)
		.where("type", "=", entityType)
		.where("id", "=", entityId)
		.executeTakeFirst();
	const entity = row
		? {
				fields: row.fields,
				clocks: row.clocks,
				createdHlc: row.created_hlc,
				deletedHlc: row.deleted_hlc,
				restoredHlc: row.restored_hlc,
			}
		: null;
	return { entity, serverTime: now() };
}
