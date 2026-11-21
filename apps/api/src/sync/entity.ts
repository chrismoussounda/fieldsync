import type { EntityRequest, EntityResponse } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Auth } from "./push.ts";
import { readEntity } from "./records.ts";
import { type Audience, canSee, type Scoping, UNSCOPED } from "./scope.ts";

export type EntityOptions = {
	now?: () => number;
	audience?: Audience;
	scoping?: Scoping;
};

/** The server's copy of one record; null when it does not exist for this device. */
export async function handleGetEntity(
	db: Kysely<Database>,
	auth: Auth,
	{ entityType, entityId }: EntityRequest,
	{ now = Date.now, audience = null, scoping = UNSCOPED }: EntityOptions = {},
): Promise<EntityResponse> {
	const entity = await readEntity(db, auth.orgId, entityType, entityId);
	const visible =
		entity &&
		(await canSee(
			db,
			auth.orgId,
			audience,
			scoping,
			entityType,
			entityId,
			entity,
		));
	return { entity: visible ? entity : null, serverTime: now() };
}
