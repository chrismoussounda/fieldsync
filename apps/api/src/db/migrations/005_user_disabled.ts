import type { Kysely } from "kysely";

// A disabled user keeps their name on past work but cannot sign in.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("users")
		.addColumn("disabled_at", "timestamptz")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.alterTable("users").dropColumn("disabled_at").execute();
}
