import { decode } from "@fieldsync/hlc";
import type { Conflict } from "@fieldsync/protocol";
import { canManage } from "@fieldsync/work-orders";
import { type Kysely, sql } from "kysely";
import type { Principal } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";
import { ApiError } from "./errors.ts";

type Side = {
	value: Conflict["winner"]["value"];
	at: number;
	by: string | null;
};

export type ConflictView = {
	id: string;
	entityType: string;
	entityId: string;
	title: string | null;
	field: string;
	reason: Conflict["reason"];
	winner: Side;
	loser: Side;
	detectedAt: string;
	reviewedAt: string | null;
	reviewedBy: string | null;
};

const LIMIT = 200;

function requireManager(principal: Principal): void {
	if (!canManage(principal.role)) throw new ApiError(403, "FORBIDDEN");
}

/** The org's conflicts, newest first; `open` leaves out reviewed ones. */
export async function listConflicts(
	db: Kysely<Database>,
	principal: Principal,
	{ open }: { open: boolean },
): Promise<ConflictView[]> {
	requireManager(principal);
	let query = db
		.selectFrom("conflicts")
		.leftJoin("entities", (join) =>
			join
				.onRef("entities.org_id", "=", "conflicts.org_id")
				.onRef("entities.type", "=", "conflicts.entity_type")
				.onRef("entities.id", "=", "conflicts.entity_id"),
		)
		.leftJoin("users", "users.id", "conflicts.reviewed_by")
		.select([
			"conflicts.id",
			"conflicts.entity_type",
			"conflicts.entity_id",
			"conflicts.field",
			"conflicts.reason",
			"conflicts.winner",
			"conflicts.loser",
			"conflicts.detected_at",
			"conflicts.reviewed_at",
			"users.name as reviewer",
			sql<string | null>`entities.fields->>'title'`.as("title"),
		])
		.where("conflicts.org_id", "=", principal.orgId)
		.orderBy("conflicts.detected_at", "desc")
		.limit(LIMIT);
	if (open) query = query.where("conflicts.reviewed_at", "is", null);
	const rows = await query.execute();

	const names = await authors(
		db,
		principal.orgId,
		rows.flatMap((r) => [r.winner.hlc, r.loser.hlc]),
	);
	const side = ({ value, hlc }: Conflict["winner"]): Side => {
		const { wall, node } = decode(hlc);
		return { value, at: wall, by: names.get(node) ?? null };
	};
	return rows.map((r) => ({
		id: r.id,
		entityType: r.entity_type,
		entityId: r.entity_id,
		title: r.title,
		field: r.field,
		reason: r.reason,
		winner: side(r.winner),
		loser: side(r.loser),
		detectedAt: r.detected_at.toISOString(),
		reviewedAt: r.reviewed_at?.toISOString() ?? null,
		reviewedBy: r.reviewer,
	}));
}

export async function reviewConflict(
	db: Kysely<Database>,
	principal: Principal,
	id: string,
	now: number,
): Promise<void> {
	requireManager(principal);
	const row = await db
		.updateTable("conflicts")
		.set({ reviewed_by: principal.userId, reviewed_at: new Date(now) })
		.where("id", "=", id)
		.where("org_id", "=", principal.orgId)
		.returning("id")
		.executeTakeFirst();
	if (!row) throw new ApiError(404, "NOT_FOUND");
}

// A clock stamp ends with the first 8 characters of its device id, unique in
// the org, which leads to the device's user.
async function authors(
	db: Kysely<Database>,
	orgId: string,
	hlcs: string[],
): Promise<Map<string, string>> {
	const nodes = [...new Set(hlcs.map((h) => decode(h).node))];
	if (nodes.length === 0) return new Map();
	const node = sql<string>`left(devices.id::text, 8)`;
	const rows = await db
		.selectFrom("devices")
		.innerJoin("users", "users.id", "devices.user_id")
		.select([node.as("node"), "users.name"])
		.where("devices.org_id", "=", orgId)
		.where(node, "in", nodes)
		.execute();
	return new Map(rows.map((r) => [r.node, r.name]));
}
