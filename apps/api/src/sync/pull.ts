import type { PullRequest, PullResponse } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Auth } from "./push.ts";

export const MAX_PULL_LIMIT = 500;

export async function handlePull(
	db: Kysely<Database>,
	auth: Auth,
	{ cursor, limit }: PullRequest,
	now: () => number = Date.now,
): Promise<PullResponse> {
	const size = Math.min(Math.max(limit, 1), MAX_PULL_LIMIT);
	// One extra row tells whether another page exists.
	const rows = await db
		.selectFrom("changes")
		.select([
			"seq",
			"op_id",
			"device_id",
			"entity_type",
			"entity_id",
			"kind",
			"patch",
			"hlc",
		])
		.where("org_id", "=", auth.orgId)
		.where("seq", ">", cursor)
		.orderBy("seq")
		.limit(size + 1)
		.execute();

	const page = rows.slice(0, size);
	const changes = page.map((row) => ({
		seq: Number(row.seq),
		opId: row.op_id,
		deviceId: row.device_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		kind: row.kind,
		patch: row.patch,
		hlc: row.hlc,
	}));
	return {
		changes,
		nextCursor: changes.at(-1)?.seq ?? cursor,
		hasMore: rows.length > size,
		serverTime: now(),
	};
}
