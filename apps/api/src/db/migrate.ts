import type { Kysely } from "kysely";
import { type MigrationProvider, Migrator } from "kysely/migration";
import * as syncTables from "./migrations/001_sync_tables.ts";
import * as authTables from "./migrations/002_auth_tables.ts";
import * as conflictsIndex from "./migrations/003_conflicts_index.ts";
import * as orgEpoch from "./migrations/004_org_epoch.ts";
import * as userDisabled from "./migrations/005_user_disabled.ts";

// Listed in code instead of read from disk, so the simulator can run them in memory.
const provider: MigrationProvider = {
	getMigrations: async () => ({
		"001_sync_tables": syncTables,
		"002_auth_tables": authTables,
		"003_conflicts_index": conflictsIndex,
		"004_org_epoch": orgEpoch,
		"005_user_disabled": userDisabled,
	}),
};

export function migrator(db: Kysely<unknown>): Migrator {
	return new Migrator({ db, provider });
}

export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
	const { error } = await migrator(db).migrateToLatest();
	if (error) throw error;
}
