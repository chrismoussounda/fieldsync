import type { Kysely } from "kysely";

// For one record's history.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createIndex("changes_org_entity")
		.on("changes")
		.columns(["org_id", "entity_type", "entity_id"])
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropIndex("changes_org_entity").execute();
}
