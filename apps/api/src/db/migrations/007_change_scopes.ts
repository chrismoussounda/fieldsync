import { type Kysely, sql } from "kysely";

// Whose record each change touched, before and after it: a technician's device
// pulls only the changes on either side of which it stands.
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("changes")
		.addColumn("scope_before", "text")
		.addColumn("scope_after", "text")
		.execute();
	// Earlier changes count as made under the current assignee. A device pulling
	// from 0 then gets the whole history of its orders and nothing of the others.
	await sql`
		update changes c
		set scope_before = e.fields->>'assigneeId',
			scope_after = e.fields->>'assigneeId'
		from entities e
		where e.org_id = c.org_id
			and e.type = c.entity_type
			and e.id = c.entity_id
			and c.entity_type = 'work_order'
	`.execute(db);
	for (const column of ["scope_before", "scope_after"]) {
		await db.schema
			.createIndex(`changes_org_${column}`)
			.on("changes")
			.columns(["org_id", column, "seq"])
			.execute();
	}
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.alterTable("changes")
		.dropColumn("scope_before")
		.dropColumn("scope_after")
		.execute();
}
