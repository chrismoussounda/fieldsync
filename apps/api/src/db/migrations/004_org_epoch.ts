import { type Kysely, sql } from "kysely";

// Changes whenever an org's data is reset or restored, so devices know to
// drop their copy and pull everything again.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("orgs")
		.addColumn("epoch", "uuid", (c) =>
			c.notNull().defaultTo(sql`gen_random_uuid()`),
		)
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.alterTable("orgs").dropColumn("epoch").execute();
}
