import type { Kysely } from "kysely";

// A visitor's own copy of the demo: entered with a key, deleted once expired.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("orgs")
		// SHA-256 of the key; the key itself is never stored.
		.addColumn("demo_key_hash", "text", (c) => c.unique())
		.addColumn("demo_expires_at", "timestamptz")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("orgs")
		.dropColumn("demo_key_hash")
		.dropColumn("demo_expires_at")
		.execute();
}
