import { canManage, type Role } from "./index.ts";

/** A stretch of time a technician spent on an order, from start to stop. */
export const TIME_ENTRY = "time_entry";

/** `endedAt` stays null while the clock runs. */
export const TIME_FIELDS = [
	"orderId",
	"technicianId",
	"startedAt",
	"endedAt",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isTime = (v: unknown) =>
	typeof v === "string" && !Number.isNaN(Date.parse(v));

export function isValidTimePatch(patch: Record<string, unknown>): boolean {
	const ok = Object.entries(patch).every(([field, value]) => {
		switch (field) {
			case "orderId":
			case "technicianId":
				return typeof value === "string" && UUID.test(value);
			case "startedAt":
				return isTime(value);
			case "endedAt":
				return value === null || isTime(value);
			default:
				return false;
		}
	});
	const { startedAt, endedAt } = patch;
	if (!ok || typeof startedAt !== "string" || typeof endedAt !== "string") {
		return ok;
	}
	return Date.parse(endedAt) >= Date.parse(startedAt);
}

type User = { id: string; role: Role };
type Fields = Record<string, unknown>;

/**
 * The office corrects or removes any entry; the assigned technician starts
 * and stops their own, and an entry never moves to another order or person.
 */
export function mayChangeTime(
	user: User,
	order: Fields | null,
	current: Fields | null,
	patch: Fields,
	kind: "upsert" | "delete" | "restore",
): boolean {
	if (!order) return false;
	if (current && ("orderId" in patch || "technicianId" in patch)) return false;
	if (
		!current &&
		!["orderId", "technicianId", "startedAt"].every((f) => f in patch)
	) {
		return false;
	}
	const startedAt = patch.startedAt ?? current?.startedAt;
	const endedAt = "endedAt" in patch ? patch.endedAt : current?.endedAt;
	if (
		typeof startedAt === "string" &&
		typeof endedAt === "string" &&
		Date.parse(endedAt) < Date.parse(startedAt)
	) {
		return false;
	}
	if (canManage(user.role)) return true;
	if (kind !== "upsert" || order.assigneeId !== user.id) return false;
	const owner = current ? current.technicianId : patch.technicianId;
	return owner === user.id;
}

/** Whole minutes between two times, or until `now` while still running. */
export function minutesBetween(
	startedAt: string,
	endedAt: string | null,
	now: number,
): number {
	const end = endedAt ? Date.parse(endedAt) : now;
	return Math.max(0, Math.floor((end - Date.parse(startedAt)) / 60_000));
}

/** "1 h 05", "45 min". */
export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
