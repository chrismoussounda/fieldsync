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
