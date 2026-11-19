import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("orgs")
		.addColumn("id", "uuid", (c) => c.primaryKey())
		.addColumn("name", "text", (c) => c.notNull())
		// Per-org change counter. Incremented under the row lock, so commit order
		// equals sequence order and a pull cursor can never skip a change.
		.addColumn("seq", "bigint", (c) => c.notNull().defaultTo(0))
		.addColumn("created_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.execute();

	await db.schema
		.createTable("entities")
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("type", "text", (c) => c.notNull())
		.addColumn("id", "uuid", (c) => c.notNull())
		.addColumn("fields", "jsonb", (c) => c.notNull())
		.addColumn("clocks", "jsonb", (c) => c.notNull())
		.addColumn("created_hlc", "text", (c) => c.notNull())
		.addColumn("deleted_hlc", "text")
		.addColumn("restored_hlc", "text")
		.addColumn("updated_seq", "bigint", (c) => c.notNull())
		.addPrimaryKeyConstraint("entities_pkey", ["org_id", "type", "id"])
		.execute();
	await db.schema
		.createIndex("entities_org_type_seq")
		.on("entities")
		.columns(["org_id", "type", "updated_seq"])
		.execute();

	await db.schema
		.createTable("changes")
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("seq", "bigint", (c) => c.notNull())
		.addColumn("op_id", "uuid", (c) => c.notNull())
		.addColumn("device_id", "uuid", (c) => c.notNull())
		.addColumn("entity_type", "text", (c) => c.notNull())
		.addColumn("entity_id", "uuid", (c) => c.notNull())
		.addColumn("kind", "text", (c) =>
			c.notNull().check(sql`kind in ('upsert', 'delete', 'restore')`),
		)
		.addColumn("patch", "jsonb", (c) => c.notNull())
		.addColumn("hlc", "text", (c) => c.notNull())
		.addColumn("created_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.addPrimaryKeyConstraint("changes_pkey", ["org_id", "seq"])
		.addUniqueConstraint("changes_org_op_key", ["org_id", "op_id"])
		.execute();

	await db.schema
		.createTable("received_ops")
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("op_id", "uuid", (c) => c.notNull())
		.addColumn("device_id", "uuid", (c) => c.notNull())
		.addColumn("result", "jsonb", (c) => c.notNull())
		.addColumn("received_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.addPrimaryKeyConstraint("received_ops_pkey", ["org_id", "op_id"])
		.execute();

	await db.schema
		.createTable("conflicts")
		.addColumn("id", "uuid", (c) => c.primaryKey())
		.addColumn("org_id", "uuid", (c) => c.notNull().references("orgs.id"))
		.addColumn("op_id", "uuid", (c) => c.notNull())
		.addColumn("entity_type", "text", (c) => c.notNull())
		.addColumn("entity_id", "uuid", (c) => c.notNull())
		.addColumn("field", "text", (c) => c.notNull())
		.addColumn("reason", "text", (c) => c.notNull())
		.addColumn("winner", "jsonb", (c) => c.notNull())
		.addColumn("loser", "jsonb", (c) => c.notNull())
		.addColumn("detected_at", "timestamptz", (c) =>
			c.notNull().defaultTo(sql`now()`),
		)
		.addColumn("reviewed_by", "uuid")
		.addColumn("reviewed_at", "timestamptz")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	for (const table of [
		"conflicts",
		"received_ops",
		"changes",
		"entities",
		"orgs",
	]) {
		await db.schema.dropTable(table).execute();
	}
}
