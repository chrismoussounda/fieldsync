import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { migrateToLatest } from "./migrate.ts";
import type { Database } from "./schema.ts";

export async function createTestDb(): Promise<Kysely<Database>> {
	const db = new Kysely<Database>({ dialect: new PGliteDialect(new PGlite()) });
	await migrateToLatest(db as Kysely<unknown>);
	return db;
}

// Starting PGlite takes seconds, so a test file shares one database and empties it between tests.
export async function emptyTestDb(db: Kysely<Database>): Promise<void> {
	await sql`truncate orgs, entities, changes, received_ops, conflicts, photo_files, users, devices, refresh_tokens`.execute(
		db,
	);
}
