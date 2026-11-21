import { type EntityState, EVERYONE, type Op } from "@fieldsync/protocol";

/** The simulation's records: a few orders, then a few photos of the first orders. */
export const ORDERS = 4;
export const PHOTOS = 2;

export function simEntity(n: number): { type: string; id: string } {
	return {
		type: n < ORDERS ? "work_order" : "photo",
		id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
	};
}

/** A photo belongs to the order with its number minus the number of orders. */
export function simParent(
	entityType: string,
	entityId: string,
): { type: string; id: string } | null {
	if (entityType !== "photo") return null;
	return simEntity(Number.parseInt(entityId.slice(-12), 16) - ORDERS);
}

/** An `assignee` that shares the record with every device, like a customer site. */
export const SHARED = 9;

/**
 * The simulation's stand-in for orders and technicians: an order belongs to
 * the device whose number is in its `assignee` field.
 */
export function simScope(state: EntityState): string | null {
	const assignee = state.fields.assignee;
	if (assignee === SHARED) return EVERYONE;
	return typeof assignee === "number" ? String(assignee) : null;
}

/**
 * Like the app's rules: the office may do anything; a technician may only
 * edit their own orders, without reassigning them, and add to their photos.
 */
export function simAuthorize(
	op: Op,
	current: EntityState | null,
	parent: EntityState | null,
	audience: string | null,
): boolean {
	if (audience === null) return true;
	if (op.kind !== "upsert") return false;
	if (op.entityType === "photo") {
		return parent !== null && simScope(parent) === audience;
	}
	return (
		current !== null &&
		simScope(current) === audience &&
		!("assignee" in op.patch)
	);
}
