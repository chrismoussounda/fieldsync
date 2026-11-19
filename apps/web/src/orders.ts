import { type EntityState, isDeleted } from "@fieldsync/merge";

import { PRIORITIES } from "@fieldsync/work-orders";

export { WORK_ORDER } from "@fieldsync/work-orders";

export type Order = {
	id: string;
	title: string;
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
