import type {
	Change,
	ChildRecord,
	PullRequest,
	PullResponse,
} from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Auth } from "./push.ts";
import { readChildren, readEntities } from "./records.ts";
import type { Audience } from "./scope.ts";

export const MAX_PULL_LIMIT = 500;

export type PullOptions = { now?: () => number; audience?: Audience };

export function handlePull(
	db: Kysely<Database>,
	auth: Auth,
	{ cursor, limit }: PullRequest,
	{ now = Date.now, audience = null }: PullOptions = {},
): Promise<PullResponse> {
	const size = Math.min(Math.max(limit, 1), MAX_PULL_LIMIT);
	// One snapshot for every read: the epoch, the counter and the changes agree,
	// and an entering record's copy is never older than the changes sent.
	return db
		.transaction()
		.setIsolationLevel("repeatable read")
		.execute(async (tx) => {
			const org = await tx
				.selectFrom("orgs")
				.select(["epoch", "seq"])
				.where("id", "=", auth.orgId)
				.executeTakeFirstOrThrow();

			let query = tx
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
					"scope_before",
					"scope_after",
				])
				.where("org_id", "=", auth.orgId)
				.where("seq", ">", cursor);
			if (audience !== null) {
				query = query.where((eb) =>
					eb.or([
						eb("scope_before", "=", audience),
						eb("scope_after", "=", audience),
					]),
				);
			}
			// One extra row tells whether another page exists.
			const rows = await query
				.orderBy("seq")
				.limit(size + 1)
				.execute();
			const page = rows.slice(0, size);
			const hasMore = rows.length > size;

			const entering = page.filter(
				(r) =>
					audience !== null &&
					r.scope_after === audience &&
					r.scope_before !== audience,
			);
			const copies = await readEntities(
				tx,
				auth.orgId,
				entering.map((r) => [r.entity_type, r.entity_id]),
			);

			const changes: Change[] = [];
			for (const row of page) {
				const change: Change = {
					seq: Number(row.seq),
					opId: row.op_id,
					deviceId: row.device_id,
					entityType: row.entity_type,
					entityId: row.entity_id,
					kind: row.kind,
					patch: row.patch,
					hlc: row.hlc,
				};
				if (audience === null || row.scope_before === row.scope_after) {
					changes.push(change);
					continue;
				}
				// The records that belong to this one go with it, like an order's photos.
				const children = await readChildren(
					tx,
					auth.orgId,
					row.entity_type,
					row.entity_id,
				);
				if (row.scope_before === audience) {
					changes.push(
						withChildren(
							{ ...change, scope: "leave" },
							children.map((c) => ({ entityType: c.type, entityId: c.id })),
						),
					);
					continue;
				}
				const state = copies.get(`${row.entity_type}:${row.entity_id}`);
				changes.push(
					state
						? withChildren(
								{ ...change, scope: "enter", state },
								children.map((c) => ({
									entityType: c.type,
									entityId: c.id,
									state: c.state,
								})),
							)
						: change,
				);
			}

			return {
				// A device that starts syncing for someone else, after a role
				// change, sees a new epoch and pulls again from 0.
				epoch: audience === null ? org.epoch : `${org.epoch}:${audience}`,
				changes,
				// A partial pull also moves past the changes it leaves out.
				nextCursor: hasMore
					? Number(page.at(-1)?.seq ?? cursor)
					: Math.max(cursor, Number(org.seq)),
				hasMore,
				serverTime: now(),
			};
		});
}

function withChildren(change: Change, children: ChildRecord[]): Change {
	return children.length > 0 ? { ...change, children } : change;
}
