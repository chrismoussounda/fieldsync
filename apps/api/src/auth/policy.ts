import type { EntityState } from "@fieldsync/merge";
import type { Op } from "@fieldsync/protocol";
import type { Principal } from "./session.ts";

export const WORK_ORDER = "work_order";

// Set by the office when planning the job.
const PLANNING = new Set([
	"title",
	"description",
	"address",
	"priority",
	"assigneeId",
	"dueDate",
]);
// Set by the technician on site.
const FIELD_WORK = new Set(["status", "notes"]);

/**
 * Whether the user may apply an operation to a record, as the server holds it.
 * Dispatchers and admins plan and edit any work order; a technician only
 * reports progress on work orders assigned to them.
 */
export function mayWrite(
	principal: Principal,
	op: Op,
	current: EntityState | null,
): boolean {
	if (op.entityType !== WORK_ORDER) return false;
	const fields = Object.keys(op.patch);
	if (fields.some((f) => !PLANNING.has(f) && !FIELD_WORK.has(f))) return false;

	switch (principal.role) {
		case "admin":
		case "dispatcher":
			return true;
		case "technician":
			return (
				op.kind === "upsert" &&
				current?.fields.assigneeId === principal.userId &&
				fields.every((f) => FIELD_WORK.has(f))
			);
	}
}
