import { decode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Principal } from "./auth/session.ts";
import type { Database } from "./db/schema.ts";

export type HistoryEntry = {
	opId: string;
	kind: Op["kind"];
	/** The values this change set; empty when newer edits had already won. */
	changes: Op["patch"];
	/** When it was made on the device, which may be long before it synced. */
	at: number;
	receivedAt: string;
	by: string | null;
	device: string | null;
};

const LIMIT = 100;

/** Every change the server applied to one record, newest first. */
export async function entityHistory(
	db: Kysely<Database>,
	principal: Principal,
	type: string,
	id: string,
): Promise<HistoryEntry[]> {
	const rows = await db
		.selectFrom("changes")
		.leftJoin("devices", "devices.id", "changes.device_id")
		.leftJoin("users", "users.id", "devices.user_id")
		.select([
			"changes.op_id",
			"changes.kind",
			"changes.patch",
			"changes.hlc",
			"changes.created_at",
			"users.name as user",
			"devices.name as device",
		])
		.where("changes.org_id", "=", principal.orgId)
		.where("changes.entity_type", "=", type)
		.where("changes.entity_id", "=", id)
		// Clock order is the order the merge settles them in, not arrival order.
		.orderBy("changes.hlc", "desc")
		.limit(LIMIT)
		.execute();
	return rows.map((r) => ({
		opId: r.op_id,
		kind: r.kind,
		changes: r.patch,
		at: decode(r.hlc).wall,
		receivedAt: r.created_at.toISOString(),
		by: r.user,
		device: r.device,
	}));
}
