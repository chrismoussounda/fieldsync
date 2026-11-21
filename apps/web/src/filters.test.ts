import { describe, expect, it } from "vitest";
import {
	addDays,
	type Context,
	DEFAULT_FILTERS,
	type Filters,
	fromQuery,
	isOverdue,
	localDate,
	matches,
	toQuery,
} from "./filters.ts";
import type { Order } from "./orders.ts";

const TODAY = "2026-11-21";
const ctx: Context = {
	userId: "me",
	today: TODAY,
	names: new Map([
		["me", "Junior Nkounkou"],
		["u2", "Grâce Mabiala"],
	]),
};

const order = (o: Partial<Order>): Order => ({
	id: "o1",
	title: "Replace the water pump",
	description: "",
	address: "Avenue de la Paix, Poto-Poto",
	priority: "normal",
	status: "assigned",
	assigneeId: "me",
	dueDate: TODAY,
	siteId: null,
	notes: "",
	...o,
});

const shown = (o: Partial<Order>, f: Partial<Filters>) =>
	matches(order(o), { ...DEFAULT_FILTERS, ...f }, ctx);

describe("matches", () => {
	it("hides finished work unless asked", () => {
		expect(shown({ status: "done" }, {})).toBe(false);
		expect(shown({ status: "cancelled" }, {})).toBe(false);
		expect(shown({ status: "done" }, { status: "all" })).toBe(true);
		expect(shown({ status: "done" }, { status: "done" })).toBe(true);
		expect(shown({ status: "open" }, { status: "done" })).toBe(false);
	});

	it("finds every word, in any field, ignoring case and accents", () => {
		expect(shown({}, { text: "PUMP poto" })).toBe(true);
		expect(shown({ assigneeId: "u2" }, { text: "grace" })).toBe(true);
		expect(shown({ notes: "Valve leaking" }, { text: "valve" })).toBe(true);
		expect(shown({}, { text: "pump generator" })).toBe(false);
	});

	it("filters by assignee", () => {
		expect(shown({}, { assignee: "me" })).toBe(true);
		expect(shown({ assigneeId: "u2" }, { assignee: "me" })).toBe(false);
		expect(shown({ assigneeId: null }, { assignee: "none" })).toBe(true);
		expect(shown({}, { assignee: "none" })).toBe(false);
		expect(shown({ assigneeId: "u2" }, { assignee: "u2" })).toBe(true);
		expect(shown({}, { assignee: "u2" })).toBe(false);
	});

	it("filters by due date", () => {
		const late = { dueDate: "2026-11-20" };
		expect(shown(late, { due: "overdue" })).toBe(true);
		expect(shown({}, { due: "overdue" })).toBe(false);
		expect(shown({}, { due: "today" })).toBe(true);
		expect(shown({ dueDate: "2026-11-28" }, { due: "week" })).toBe(true);
		expect(shown({ dueDate: "2026-11-29" }, { due: "week" })).toBe(false);
		expect(shown(late, { due: "week" })).toBe(false);
		expect(shown({ dueDate: null }, { due: "week" })).toBe(false);
	});

	it("filters urgent work", () => {
		expect(shown({ priority: "urgent" }, { urgentOnly: true })).toBe(true);
		expect(shown({}, { urgentOnly: true })).toBe(false);
	});
});

describe("isOverdue", () => {
	it("is never true of finished work", () => {
		expect(isOverdue(order({ dueDate: "2026-11-01" }), TODAY)).toBe(true);
		const done = order({ dueDate: "2026-11-01", status: "done" });
		expect(isOverdue(done, TODAY)).toBe(false);
	});
});

describe("dates", () => {
	it("count in the device's own calendar", () => {
		expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
		expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
	});
});

describe("query", () => {
	it("round-trips the filters a link sets", () => {
		const f = { assignee: "none", due: "overdue", urgentOnly: true } as const;
		expect(fromQuery(toQuery(f))).toEqual(f);
		expect(fromQuery("q=pump&status=all")).toEqual({
			text: "pump",
			status: "all",
		});
		expect(fromQuery("due=nonsense")).toEqual({});
	});
});
