import type { EntityRequest, EntityResponse } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Auth } from "./push.ts";
import { type Audience, canSee, type ScopeOf, unscoped } from "./scope.ts";

export type EntityOptions = {
	now?: () => number;
	audience?: Audience;
	scopeOf?: ScopeOf;
};

/** The server's copy of one record; null when it does not exist for this device. */
export async function handleGetEntity(
	db: Kysely<Database>,
	auth: Auth,
	{ entityType, entityId }: EntityRequest,
	{ now = Date.now, audience = null, scopeOf = unscoped }: EntityOptions = {},
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
	const visible = entity && canSee(audience, scopeOf, entityType, entity);
	return { entity: visible ? entity : null, serverTime: now() };
}
