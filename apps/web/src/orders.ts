import { type EntityState, isDeleted } from "@fieldsync/merge";
import { FIELDS, type Field, PRIORITIES } from "@fieldsync/work-orders";

export { WORK_ORDER } from "@fieldsync/work-orders";

export type Order = {
	id: string;
	title: string;
	description: string;
	address: string;
	priority: string;
	status: string;
	assigneeId: string | null;
	dueDate: string | null;
	notes: string;
};

export const STATUS_LABELS: Record<string, string> = {
	open: "Open",
	assigned: "Assigned",
	in_progress: "In progress",
	done: "Done",
	cancelled: "Cancelled",
};

/** Reads a stored record as a work order; null once it is deleted. */
export function toOrder(id: string, state: EntityState): Order | null {
	if (isDeleted(state)) return null;
	const f = state.fields;
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	return {
		id,
		title: text(f.title) || "Untitled",
		description: text(f.description),
		address: text(f.address),
		priority: text(f.priority) || "normal",
		status: text(f.status) || "open",
		assigneeId: text(f.assigneeId) || null,
		dueDate: text(f.dueDate) || null,
		notes: text(f.notes),
	};
}

const rank = (p: string) => (PRIORITIES as readonly string[]).indexOf(p);

/** Unfinished first, then by priority and due date. */
export function byUrgency(a: Order, b: Order): number {
	const finished = (o: Order) => (o.status === "done" ? 1 : 0);
	return (
		finished(a) - finished(b) ||
		rank(a.priority) - rank(b.priority) ||
		(a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")
	);
}

/** What a form edits: every field as text, empty when unset. */
export type Draft = Record<Field, string>;

export function toDraft(state: EntityState | null): Draft {
	const draft = {} as Draft;
	for (const field of FIELDS) {
		const value = state?.fields[field];
		draft[field] = typeof value === "string" ? value : "";
	}
	return draft;
}

/**
 * The fields the user changed and may change. Untouched fields are left out,
 * so they cannot overwrite what someone else edited meanwhile.
 */
export function patchOf(
	before: Draft,
	after: Draft,
	editable: ReadonlySet<Field>,
): Record<string, string | null> {
	const patch: Record<string, string | null> = {};
	for (const field of FIELDS) {
		if (!editable.has(field) || after[field] === before[field]) continue;
		const value = after[field].trim();
		patch[field] = value === "" ? null : value;
	}
	return patch;
}
