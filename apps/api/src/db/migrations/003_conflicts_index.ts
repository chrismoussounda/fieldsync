import type { Kysely } from "kysely";

// The conflict log lists an org's conflicts, newest first.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createIndex("conflicts_org_detected")
		.on("conflicts")
		.columns(["org_id", "detected_at"])
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropIndex("conflicts_org_detected").execute();
}
