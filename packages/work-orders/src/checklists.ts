import { canManage, type Role } from "./index.ts";

/** One step of a work order's checklist, a record of its own so concurrent edits never collide. */
export const CHECKLIST_ITEM = "checklist_item";

export const MAX_ITEM_LABEL = 200;

/** Written by the office. */
const PLAN = ["orderId", "label", "position"] as const;
/** Written by whoever ticks the item. */
const TICK = ["done", "doneBy", "doneAt"] as const;
export const CHECKLIST_FIELDS = [...PLAN, ...TICK] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidChecklistPatch(patch: Record<string, unknown>): boolean {
	return Object.entries(patch).every(([field, value]) => {
		switch (field) {
			case "orderId":
				return typeof value === "string" && UUID.test(value);
			case "label":
				return (
					typeof value === "string" &&
					value.trim().length > 0 &&
					value.length <= MAX_ITEM_LABEL
				);
			case "position":
				return typeof value === "number" && Number.isFinite(value);
			case "done":
				return typeof value === "boolean";
			case "doneBy":
				return (
					value === null || (typeof value === "string" && UUID.test(value))
				);
			case "doneAt":
				return (
					value === null ||
					(typeof value === "string" && !Number.isNaN(Date.parse(value)))
				);
			default:
				return false;
		}
	});
}

type User = { id: string; role: Role };
type Fields = Record<string, unknown>;

/**
 * Whether a change to an item is allowed: the office writes and removes items;
 * the assigned technician only ticks them, in their own name. An item never
 * moves to another order.
 */
export function mayChangeItem(
	user: User,
	order: Fields | null,
	current: Fields | null,
	patch: Fields,
	kind: "upsert" | "delete" | "restore",
): boolean {
	if (!order) return false;
	if (current && "orderId" in patch) return false;
	if (!current && !PLAN.every((f) => f in patch)) return false;
	if (canManage(user.role)) return true;
	if (kind !== "upsert" || !current || order.assigneeId !== user.id) {
		return false;
	}
	const fields = Object.keys(patch);
	if (!fields.every((f) => (TICK as readonly string[]).includes(f)))
		return false;
	return (
		patch.doneBy === undefined ||
		patch.doneBy === null ||
		patch.doneBy === user.id
	);
}
