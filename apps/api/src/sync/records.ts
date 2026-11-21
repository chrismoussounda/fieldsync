import type { EntityState } from "@fieldsync/protocol";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../db/schema.ts";

type Row = Selectable<Database["entities"]>;

export function toState(row: Row): EntityState {
	return {
		fields: row.fields,
		clocks: row.clocks,
		createdHlc: row.created_hlc,
		deletedHlc: row.deleted_hlc,
		restoredHlc: row.restored_hlc,
	};
}

/** The server's copy of one record, or null. */
export async function readEntity(
	db: Kysely<Database>,
	orgId: string,
	type: string,
	id: string,
): Promise<EntityState | null> {
	const row = await db
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("type", "=", type)
		.where("id", "=", id)
		.executeTakeFirst();
	return row ? toState(row) : null;
}

/** Several records at once, keyed `type:id`. */
export async function readEntities(
	db: Kysely<Database>,
	orgId: string,
	keys: [string, string][],
): Promise<Map<string, EntityState>> {
	if (keys.length === 0) return new Map();
	const rows = await db
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", orgId)
		.where((eb) =>
			eb.or(
				keys.map(([type, id]) =>
					eb.and([eb("type", "=", type), eb("id", "=", id)]),
				),
			),
		)
		.execute();
	return new Map(rows.map((r) => [`${r.type}:${r.id}`, toState(r)]));
}

/** The records that belong to one record, like the photos of an order. */
export async function readChildren(
	db: Kysely<Database>,
	orgId: string,
	parentType: string,
	parentId: string,
): Promise<{ type: string; id: string; state: EntityState }[]> {
	const rows = await db
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("parent_type", "=", parentType)
		.where("parent_id", "=", parentId)
		.orderBy("id")
		.execute();
	return rows.map((r) => ({ type: r.type, id: r.id, state: toState(r) }));
}
