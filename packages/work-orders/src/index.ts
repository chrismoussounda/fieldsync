/** The work-order rules shared by the server, which enforces them, and the app, which follows them. */

export const WORK_ORDER = "work_order";

export type Role = "technician" | "dispatcher" | "admin";

// Set by the office when planning the job.
export const PLANNING_FIELDS = [
	"title",
	"description",
	"address",
	"priority",
	"assigneeId",
	"dueDate",
	"siteId",
	"location",
] as const;

// Set by the technician on site.
export const PROGRESS_FIELDS = ["status", "notes"] as const;

export type Field =
	| (typeof PLANNING_FIELDS)[number]
	| (typeof PROGRESS_FIELDS)[number];

export const FIELDS: readonly Field[] = [
	...PLANNING_FIELDS,
	...PROGRESS_FIELDS,
];

export const STATUSES = [
	"open",
	"assigned",
	"in_progress",
	"done",
	"cancelled",
] as const;

export const PRIORITIES = ["urgent", "normal", "low"] as const;

/** Whether the role may create, delete or restore work orders. */
export function canManage(role: Role): boolean {
	return role === "dispatcher" || role === "admin";
}

/**
 * The fields a user may change on a work order as it stands; null when it does
 * not exist yet. A technician only reports progress on orders assigned to them.
 */
export function editableFields(
	user: { id: string; role: Role },
	current: Record<string, unknown> | null,
): ReadonlySet<Field> {
	if (canManage(user.role)) return new Set(FIELDS);
	if (current?.assigneeId === user.id) return new Set(PROGRESS_FIELDS);
	return new Set();
}

export const MAX_LENGTH = {
	title: 200,
	address: 300,
	description: 5000,
	notes: 5000,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// A work order always has these; the others can be cleared with null.
const REQUIRED = new Set<string>(["title", "status", "priority"]);

/** A point on the map, picked by the office so directions lead to the door. */
export type Location = { lat: number; lng: number };

export function isLocation(value: unknown): value is Location {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value);
	const { lat, lng } = value as Record<string, unknown>;
	return (
		keys.length === 2 &&
		typeof lat === "number" &&
		typeof lng === "number" &&
		Math.abs(lat) <= 90 &&
		Math.abs(lng) <= 180
	);
}

/** Whether a value fits its field: known choices, real dates, bounded text. */
export function isValidValue(field: string, value: unknown): boolean {
	if (value === null) return !REQUIRED.has(field);
	if (field === "location") return isLocation(value);
	if (typeof value !== "string") return false;
	switch (field) {
		case "status":
			return (STATUSES as readonly string[]).includes(value);
		case "priority":
			return (PRIORITIES as readonly string[]).includes(value);
		case "assigneeId":
		case "siteId":
			return UUID.test(value);
		case "dueDate":
			return isDay(value);
		case "title":
		case "address":
		case "description":
		case "notes":
			return value.trim().length > 0 && value.length <= MAX_LENGTH[field];
		default:
			return false;
	}
}

// Date.parse rolls 2026-02-30 over to 2 March, so the date must read back unchanged.
function isDay(value: string): boolean {
	const time = Date.parse(value);
	return (
		DAY.test(value) &&
		!Number.isNaN(time) &&
		new Date(time).toISOString().startsWith(value)
	);
}

export function isValidPatch(patch: Record<string, unknown>): boolean {
	return Object.entries(patch).every(([field, value]) =>
		isValidValue(field, value),
	);
}

export * from "./checklists.ts";
export * from "./parts.ts";
export * from "./photos.ts";
export * from "./sites.ts";
export * from "./time.ts";
