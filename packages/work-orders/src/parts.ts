import { canManage, type Role } from "./index.ts";

/** A part or material used on a job, a record of its own so two people adding at once never collide. */
export const PART = "part";

export const PART_FIELDS = [
	"orderId",
	"name",
	"quantity",
	"unit",
	"addedBy",
	"addedAt",
] as const;

export const MAX_PART_NAME = 200;
export const MAX_UNIT = 20;
export const MAX_QUANTITY = 100_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CREATE = ["orderId", "name", "quantity", "addedBy", "addedAt"];

const text = (value: unknown, max: number) =>
	typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function isValidPartPatch(patch: Record<string, unknown>): boolean {
	return Object.entries(patch).every(([field, value]) => {
		switch (field) {
			case "orderId":
			case "addedBy":
				return typeof value === "string" && UUID.test(value);
			case "name":
				return text(value, MAX_PART_NAME);
			case "quantity":
				return (
					typeof value === "number" &&
					Number.isFinite(value) &&
					value > 0 &&
					value <= MAX_QUANTITY
				);
			case "unit":
				return value === null || text(value, MAX_UNIT);
			case "addedAt":
				return typeof value === "string" && !Number.isNaN(Date.parse(value));
			default:
				return false;
		}
	});
}

type Fields = Record<string, unknown>;

/**
 * The office records and corrects any part; the assigned technician adds
 * parts in their own name and corrects or removes their own. A part never
 * moves to another order or person.
 */
export function mayChangePart(
	user: { id: string; role: Role },
	order: Fields | null,
	current: Fields | null,
	patch: Fields,
	_kind: "upsert" | "delete" | "restore",
): boolean {
	if (!order) return false;
	if (current && ("orderId" in patch || "addedBy" in patch)) return false;
	if (!current && !CREATE.every((f) => f in patch)) return false;
	if (canManage(user.role)) return true;
	if (order.assigneeId !== user.id) return false;
	const owner = current ? current.addedBy : patch.addedBy;
	return owner === user.id;
}
