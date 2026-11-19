import type { EntityState } from "@fieldsync/merge";
import type { Op } from "@fieldsync/protocol";
import {
	canManage,
	editableFields,
	FIELDS,
	type Field,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import type { Principal } from "./session.ts";

const KNOWN = new Set<string>(FIELDS);

/** Whether the user may apply an operation to a record, as the server holds it. */
export function mayWrite(
	principal: Principal,
	op: Op,
	current: EntityState | null,
): boolean {
	if (op.entityType !== WORK_ORDER) return false;
	const fields = Object.keys(op.patch);
	if (!fields.every((f) => KNOWN.has(f))) return false;
	if (op.kind !== "upsert" && !canManage(principal.role)) return false;

	const editable = editableFields(
		{ id: principal.userId, role: principal.role },
		current?.fields ?? null,
	);
	return fields.every((f) => editable.has(f as Field));
}
