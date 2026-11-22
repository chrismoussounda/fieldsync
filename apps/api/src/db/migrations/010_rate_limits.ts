import type { Kysely } from "kysely";

// Request counts kept in the database, so every copy of the server shares them.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("rate_limits")
		.addColumn("key", "text", (c) => c.primaryKey())
		.addColumn("hits", "integer", (c) => c.notNull())
		.addColumn("reset_at", "timestamptz", (c) => c.notNull())
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropTable("rate_limits").execute();
}
