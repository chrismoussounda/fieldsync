import { type Kysely, sql } from "kysely";
import type { Database } from "../db/schema.ts";

/**
 * Wipes an org's synced data and starts a new epoch; users and devices stay.
 * The change counter keeps counting, so no number is ever handed out twice.
 */
export function resetOrg(db: Kysely<Database>, orgId: string): Promise<void> {
	return db.transaction().execute(async (tx) => {
		// Takes the org row lock first, like a push, so no push lands half-wiped.
		await tx
			.updateTable("orgs")
			.set({ epoch: sql`gen_random_uuid()` })
			.where("id", "=", orgId)
			.executeTakeFirstOrThrow();
		for (const table of [
			"conflicts",
			"photo_files",
			"received_ops",
			"changes",
			"entities",
		] as const) {
			await tx.deleteFrom(table).where("org_id", "=", orgId).execute();
		}
	});
}
