import type { Order } from "./orders.ts";

export type Filters = {
	text: string;
	/** "active" leaves out done and cancelled work. */
	status: string;
	/** "all", "me", "none" or a member id. */
	assignee: string;
	due: "any" | "overdue" | "today" | "week";
	urgentOnly: boolean;
};

export const DEFAULT_FILTERS: Filters = {
	text: "",
	status: "active",
	assignee: "all",
	due: "any",
	urgentOnly: false,
};

const FINISHED = new Set(["done", "cancelled"]);

export const isFinished = (o: Order) => FINISHED.has(o.status);

/** Late: due before today and not finished. */
export const isOverdue = (o: Order, today: string) =>
	!isFinished(o) && o.dueDate !== null && o.dueDate < today;

/** The device's local date as YYYY-MM-DD, the format due dates use. */
export function localDate(at = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return localDate(new Date(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
}

// Lower case without accents, so "grace" finds "Grâce".
const fold = (s: string) =>
	s
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

export type Context = {
	userId: string;
	today: string;
	names: ReadonlyMap<string, string>;
};

export function matches(o: Order, f: Filters, ctx: Context): boolean {
	if (
		f.status === "active"
			? isFinished(o)
			: f.status !== "all" && o.status !== f.status
	) {
		return false;
	}
	if (f.assignee === "me" && o.assigneeId !== ctx.userId) return false;
	if (f.assignee === "none" && o.assigneeId !== null) return false;
	if (
		!["all", "me", "none"].includes(f.assignee) &&
		o.assigneeId !== f.assignee
	) {
		return false;
	}
	if (f.urgentOnly && o.priority !== "urgent") return false;
	if (f.due === "overdue" && !isOverdue(o, ctx.today)) return false;
	if (f.due === "today" && o.dueDate !== ctx.today) return false;
	if (
		f.due === "week" &&
		(o.dueDate === null ||
			o.dueDate < ctx.today ||
			o.dueDate > addDays(ctx.today, 7))
	) {
		return false;
	}
	const words = fold(f.text).split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;
	const haystack = fold(
		[
			o.title,
			o.address,
			o.description,
			o.notes,
			o.assigneeId ? (ctx.names.get(o.assigneeId) ?? "") : "",
		].join(" "),
	);
	// Every word must appear somewhere, in any order.
	return words.every((w) => haystack.includes(w));
}

/** Filters set in a link, like `#/?assignee=none&due=overdue`. */
export function fromQuery(query: string): Partial<Filters> {
	const params = new URLSearchParams(query);
	const found: Partial<Filters> = {};
	const text = params.get("q");
	if (text !== null) found.text = text;
	const status = params.get("status");
	if (status) found.status = status;
	const assignee = params.get("assignee");
	if (assignee) found.assignee = assignee;
	const due = params.get("due");
	if (due === "overdue" || due === "today" || due === "week") found.due = due;
	if (params.get("urgent") === "1") found.urgentOnly = true;
	return found;
}

export function toQuery(f: Partial<Filters>): string {
	const params = new URLSearchParams();
	if (f.text) params.set("q", f.text);
	if (f.status) params.set("status", f.status);
	if (f.assignee) params.set("assignee", f.assignee);
	if (f.due && f.due !== "any") params.set("due", f.due);
	if (f.urgentOnly) params.set("urgent", "1");
	return params.toString();
}
