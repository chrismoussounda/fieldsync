import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("users")
		.addColumn("id", "uuid", (c) => c.primaryKey())
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("email", "text", (c) => c.notNull().unique())
		.addColumn("name", "text", (c) => c.notNull())
		.addColumn("password_hash", "text", (c) => c.notNull())
		.addColumn("role", "text", (c) =>
			c.notNull().check(sql`role in ('technician', 'dispatcher', 'admin')`),
		)
		.addColumn("created_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.execute();

	await db.schema
		.createTable("devices")
		// Generated on the device, before it ever reaches the server.
		.addColumn("id", "uuid", (c) => c.primaryKey())
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("user_id", "uuid", (c) => c.notNull().references("users.id"))
		.addColumn("name", "text", (c) => c.notNull())
		.addColumn("registered_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.addColumn("last_seen_at", "timestamptz")
		.addColumn("revoked_at", "timestamptz")
		.execute();
	// The first 8 characters of a device id break clock ties, so they must be
	// unique within an org.
	await db.schema
		.createIndex("devices_org_node")
		.unique()
		.on("devices")
		.columns(["org_id"])
		.expression(sql`left(id::text, 8)`)
		.execute();

	await db.schema
		.createTable("refresh_tokens")
		// SHA-256 of the token; the token itself is never stored.
		.addColumn("hash", "text", (c) => c.primaryKey())
		.addColumn("family_id", "uuid", (c) => c.notNull())
		.addColumn("user_id", "uuid", (c) => c.notNull().references("users.id"))
		.addColumn("device_id", "uuid", (c) => c.notNull().references("devices.id"))
		.addColumn("expires_at", "timestamptz", (c) => c.notNull())
		.addColumn("used_at", "timestamptz")
		.execute();
	await db.schema
		.createIndex("refresh_tokens_family")
		.on("refresh_tokens")
		.column("family_id")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	for (const table of ["refresh_tokens", "devices", "users"]) {
		await db.schema.dropTable(table).execute();
	}
}
