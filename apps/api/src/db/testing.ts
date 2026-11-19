import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { migrateToLatest } from "./migrate.ts";
import type { Database } from "./schema.ts";

export async function createTestDb(): Promise<Kysely<Database>> {
	const db = new Kysely<Database>({ dialect: new PGliteDialect(new PGlite()) });
	await migrateToLatest(db as Kysely<unknown>);
	return db;
}
