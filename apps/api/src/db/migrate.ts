import type { Kysely } from "kysely";
import { type MigrationProvider, Migrator } from "kysely/migration";
import * as syncTables from "./migrations/001_sync_tables.ts";

// Listed in code instead of read from disk, so the simulator can run them in memory.
const provider: MigrationProvider = {
	getMigrations: async () => ({ "001_sync_tables": syncTables }),
};

export function migrator(db: Kysely<unknown>): Migrator {
	return new Migrator({ db, provider });
}

export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
	const { error } = await migrator(db).migrateToLatest();
	if (error) throw error;
}
