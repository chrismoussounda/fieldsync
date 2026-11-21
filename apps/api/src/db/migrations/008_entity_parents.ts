import type { Kysely } from "kysely";

// A record can belong to another, like a photo to its order: it shares that
// record's scope, and enters or leaves a device with it.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("entities")
		.addColumn("parent_type", "text")
		.addColumn("parent_id", "uuid")
		.execute();
	await db.schema
		.createIndex("entities_org_parent")
		.on("entities")
		.columns(["org_id", "parent_type", "parent_id"])
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("entities")
		.dropColumn("parent_type")
		.dropColumn("parent_id")
		.execute();
}
