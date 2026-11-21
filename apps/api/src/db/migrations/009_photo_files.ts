import { type Kysely, sql } from "kysely";

// Photo images, kept out of the change log: devices sync a photo's details
// like any record and fetch the image itself only when they need it.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("photo_files")
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("id", "uuid", (c) => c.notNull())
		.addColumn("content_type", "text", (c) => c.notNull())
		.addColumn("bytes", "bytea", (c) => c.notNull())
		.addColumn("uploaded_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.addPrimaryKeyConstraint("photo_files_pkey", ["org_id", "id"])
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropTable("photo_files").execute();
}
