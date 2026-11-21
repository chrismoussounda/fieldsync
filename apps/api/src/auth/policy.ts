import type { EntityState } from "@fieldsync/merge";
import type { Op } from "@fieldsync/protocol";
import {
	canManage,
	editableFields,
	FIELDS,
	type Field,
	isValidPatch,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Audience, Scoping } from "../sync/scope.ts";
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

/** A work order is in the scope of its assignee; nothing else is scoped yet. */
export const WORK_ORDER_SCOPING: Scoping = {
	scopeOf: (entityType, state) =>
		entityType === WORK_ORDER && typeof state.fields.assigneeId === "string"
			? state.fields.assigneeId
			: null,
	parentOf: () => null,
};

/** Technicians sync only their own orders; the office syncs everything. */
export function audienceOf(principal: Principal): Audience {
	return principal.role === "technician" ? principal.userId : null;
}

/** Values that fit their fields, and an assignee who is one of the org's technicians. */
export function isValidOrder(
	op: Op,
	technicians: ReadonlySet<string>,
): boolean {
	if (!isValidPatch(op.patch)) return false;
	const assignee = op.patch.assigneeId;
	return typeof assignee !== "string" || technicians.has(assignee);
}

export async function technicianIds(
	db: Kysely<Database>,
	orgId: string,
): Promise<ReadonlySet<string>> {
	const rows = await db
		.selectFrom("users")
		.select("id")
		.where("org_id", "=", orgId)
		.where("role", "=", "technician")
		.where("disabled_at", "is", null)
		.execute();
	return new Set(rows.map((r) => r.id));
}
