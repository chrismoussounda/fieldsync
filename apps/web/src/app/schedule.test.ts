import { describe, expect, it } from "vitest";
import type { Order } from "../orders.ts";
import {
	boardOf,
	canMove,
	cellKey,
	daysFrom,
	moveOf,
	weekOf,
} from "./schedule.ts";

const order = (o: Partial<Order>): Order => ({
	id: "o1",
	title: "Fix pump",
	description: "",
	address: "",
	priority: "normal",
	status: "assigned",
	assigneeId: "junior",
	dueDate: "2026-11-24",
	siteId: null,
	location: null,
	notes: "",
	...o,
});

describe("weekOf", () => {
	it("starts the week on Monday, Sundays included", () => {
		expect(weekOf("2026-11-23")).toBe("2026-11-23");
		expect(weekOf("2026-11-26")).toBe("2026-11-23");
		expect(weekOf("2026-11-29")).toBe("2026-11-23");
	});

	it("crosses months and years", () => {
		expect(weekOf("2026-12-02")).toBe("2026-11-30");
		expect(weekOf("2027-01-01")).toBe("2026-12-28");
	});

	it("lists the seven days", () => {
		expect(daysFrom("2026-12-28")).toEqual([
			"2026-12-28",
			"2026-12-29",
			"2026-12-30",
			"2026-12-31",
			"2027-01-01",
			"2027-01-02",
			"2027-01-03",
		]);
	});
});

describe("boardOf", () => {
	const days = daysFrom("2026-11-23");

	it("puts each job in its technician's day, unassigned ones on their own row", () => {
		const a = order({ id: "a" });
		const b = order({ id: "b", assigneeId: null, status: "open" });
		const c = order({ id: "c" });
		const { cells } = boardOf([a, b, c], days);
		expect(cells.get(cellKey("junior", "2026-11-24"))).toEqual([a, c]);
		expect(cells.get(cellKey(null, "2026-11-24"))).toEqual([b]);
	});

	it("leaves out other weeks, and trays undated jobs unless finished", () => {
		const { cells, unplanned } = boardOf(
			[
				order({ id: "next", dueDate: "2026-11-30" }),
				order({ id: "undated", dueDate: null }),
				order({ id: "closed", dueDate: null, status: "cancelled" }),
			],
			days,
		);
		expect(cells.size).toBe(0);
		expect(unplanned.map((o) => o.id)).toEqual(["undated"]);
	});
});

describe("moveOf", () => {
	it("changes only what moved", () => {
		expect(
			moveOf(order({}), { assigneeId: "junior", dueDate: "2026-11-25" }),
		).toEqual({ dueDate: "2026-11-25" });
		expect(
			moveOf(order({}), { assigneeId: "junior", dueDate: "2026-11-24" }),
		).toEqual({});
	});

	it("assigns an open job given to someone, and reopens one taken back", () => {
		const open = order({ assigneeId: null, status: "open" });
		expect(
			moveOf(open, { assigneeId: "grace", dueDate: "2026-11-24" }),
		).toEqual({ assigneeId: "grace", status: "assigned" });
		expect(
			moveOf(order({}), { assigneeId: null, dueDate: "2026-11-24" }),
		).toEqual({ assigneeId: null, status: "open" });
	});

	it("keeps a started job started, whoever gets it", () => {
		const started = order({ status: "in_progress" });
		expect(moveOf(started, { assigneeId: "grace", dueDate: null })).toEqual({
			assigneeId: "grace",
			dueDate: null,
		});
	});

	it("keeps finished jobs where they were done", () => {
		expect(canMove(order({ status: "done" }))).toBe(false);
		expect(canMove(order({ status: "cancelled" }))).toBe(false);
		expect(canMove(order({ status: "in_progress" }))).toBe(true);
	});
});
