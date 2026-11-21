import type { EntityState } from "@fieldsync/merge";
import type { Op } from "@fieldsync/protocol";
import {
	CHECKLIST_ITEM,
	canAddPhoto,
	canChangePhoto,
	canManage,
	editableFields,
	FIELDS,
	type Field,
	isPhotoChange,
	isValidChecklistPatch,
	isValidPatch,
	isValidPhotoPatch,
	mayChangeItem,
	PHOTO,
	PHOTO_FIELDS,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Audience, Scoping } from "../sync/scope.ts";
import type { Principal } from "./session.ts";

const KNOWN = new Set<string>(FIELDS);
const KNOWN_PHOTO = new Set<string>(PHOTO_FIELDS);
const CHILDREN = new Set([PHOTO, CHECKLIST_ITEM]);

/**
 * Whether the user may apply an operation to a record, as the server holds
 * it; `parent` is a photo's order.
 */
export function mayWrite(
	principal: Principal,
	op: Op,
	current: EntityState | null,
	parent: EntityState | null = null,
): boolean {
	if (op.entityType === CHECKLIST_ITEM) {
		return mayChangeItem(
			{ id: principal.userId, role: principal.role },
			parent?.fields ?? null,
			current?.fields ?? null,
			op.patch,
			op.kind,
		);
	}
	if (op.entityType === PHOTO) {
		return mayWritePhoto(principal, op, current, parent);
	}
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

function mayWritePhoto(
	principal: Principal,
	op: Op,
	current: EntityState | null,
	order: EntityState | null,
): boolean {
	const user = { id: principal.userId, role: principal.role };
	if (!Object.keys(op.patch).every((f) => KNOWN_PHOTO.has(f))) return false;
	if (op.kind !== "upsert") {
		return (
			current !== null &&
			canChangePhoto(user, order?.fields ?? null, current.fields)
		);
	}
	if (!isPhotoChange(user, op.patch, current?.fields ?? null)) return false;
	return current
		? canChangePhoto(user, order?.fields ?? null, current.fields)
		: canAddPhoto(user, order?.fields ?? null);
}

/**
 * A work order is in the scope of its assignee; its photos and checklist
 * items belong to it and go wherever it goes.
 */
export const WORK_ORDER_SCOPING: Scoping = {
	scopeOf: (entityType, state) =>
		entityType === WORK_ORDER && typeof state.fields.assigneeId === "string"
			? state.fields.assigneeId
			: null,
	parentOf: (entityType, _id, state) =>
		CHILDREN.has(entityType) && typeof state.fields.orderId === "string"
			? { type: WORK_ORDER, id: state.fields.orderId }
			: null,
};

/** Technicians sync only their own orders; the office syncs everything. */
export function audienceOf(principal: Principal): Audience {
	return principal.role === "technician" ? principal.userId : null;
}

/**
 * Values that fit their fields; for an order, an assignee who is one of the
 * org's technicians.
 */
export function isValidRecord(
	op: Op,
	technicians: ReadonlySet<string>,
): boolean {
	if (op.entityType === PHOTO) return isValidPhotoPatch(op.patch);
	if (op.entityType === CHECKLIST_ITEM) return isValidChecklistPatch(op.patch);
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
