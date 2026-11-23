import type { Kysely } from "kysely";
import { type MigrationProvider, Migrator } from "kysely/migration";
import * as syncTables from "./migrations/001_sync_tables.ts";
import * as authTables from "./migrations/002_auth_tables.ts";
import * as conflictsIndex from "./migrations/003_conflicts_index.ts";
import * as orgEpoch from "./migrations/004_org_epoch.ts";
import * as userDisabled from "./migrations/005_user_disabled.ts";
import * as changesByEntity from "./migrations/006_changes_by_entity.ts";
import * as changeScopes from "./migrations/007_change_scopes.ts";
import * as entityParents from "./migrations/008_entity_parents.ts";
import * as photoFiles from "./migrations/009_photo_files.ts";
import * as rateLimits from "./migrations/010_rate_limits.ts";
import * as demoWorkspaces from "./migrations/011_demo_workspaces.ts";

// Listed in code instead of read from disk, so the simulator can run them in memory.
const provider: MigrationProvider = {
	getMigrations: async () => ({
		"001_sync_tables": syncTables,
		"002_auth_tables": authTables,
		"003_conflicts_index": conflictsIndex,
		"004_org_epoch": orgEpoch,
		"005_user_disabled": userDisabled,
		"006_changes_by_entity": changesByEntity,
		"007_change_scopes": changeScopes,
		"008_entity_parents": entityParents,
		"009_photo_files": photoFiles,
		"010_rate_limits": rateLimits,
		"011_demo_workspaces": demoWorkspaces,
	}),
};

export function migrator(db: Kysely<unknown>): Migrator {
	return new Migrator({ db, provider });
}

export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
	const { error } = await migrator(db).migrateToLatest();
	if (error) throw error;
}
