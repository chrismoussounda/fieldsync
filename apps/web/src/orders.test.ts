import type { EntityState } from "@fieldsync/merge";
import { FIELDS, PROGRESS_FIELDS } from "@fieldsync/work-orders";
import { describe, expect, it } from "vitest";
import {
	byUrgency,
	describeValue,
	type Order,
	patchOf,
	toDraft,
	toOrder,
} from "./orders.ts";

const HLC = "0000000000001-0000-0a1b2c3d";

function state(fields: EntityState["fields"], deleted = false): EntityState {
	return {
		fields,
		clocks: {},
		createdHlc: HLC,
		deletedHlc: deleted ? HLC : null,
		restoredHlc: null,
	};
}

describe("describeValue", () => {
	const names = new Map([["u1", "Junior"]]);

	it("names people and labels codes", () => {
		expect(describeValue("assigneeId", "u1", names)).toBe("Junior");
		expect(describeValue("assigneeId", "gone", names)).toBe("Someone");
		expect(describeValue("status", "in_progress", names)).toBe("In progress");
		expect(describeValue("priority", "urgent", names)).toBe("Urgent");
		expect(describeValue("notes", null, names)).toBe("(empty)");
	});

	it("shortens long text", () => {
		const shown = describeValue("notes", "x".repeat(200), names);
		expect(shown).toHaveLength(80);
		expect(shown.endsWith("…")).toBe(true);
	});
});

describe("toOrder", () => {
	it("fills in what a partly synced record lacks", () => {
		expect(toOrder("o1", state({ title: "Fix pump" }))).toEqual({
			id: "o1",
			title: "Fix pump",
			description: "",
			address: "",
			priority: "normal",
			status: "open",
			assigneeId: null,
			dueDate: null,
			notes: "",
		});
	});

	it("hides a deleted order", () => {
		expect(toOrder("o1", state({ title: "x" }, true))).toBeNull();
	});
});

describe("byUrgency", () => {
	it("puts unfinished, urgent and soonest first", () => {
		const order = (id: string, o: Partial<Order>): Order => ({
			id,
			title: id,
			description: "",
			address: "",
			priority: "normal",
			status: "assigned",
			assigneeId: null,
			dueDate: null,
			notes: "",
			...o,
		});
		const sorted = [
			order("done", { status: "done", priority: "urgent" }),
			order("later", { dueDate: "2026-12-02" }),
			order("urgent", { priority: "urgent" }),
			order("sooner", { dueDate: "2026-12-01" }),
		].sort(byUrgency);
		expect(sorted.map((o) => o.id)).toEqual([
			"urgent",
			"sooner",
			"later",
			"done",
		]);
	});
});

describe("patchOf", () => {
	const before = toDraft(
		state({ title: "Fix pump", status: "assigned", notes: "" }),
	);

	it("sends only the fields that changed", () => {
		const after = { ...before, status: "done", notes: "  Valve replaced " };
		expect(patchOf(before, after, new Set(FIELDS))).toEqual({
			status: "done",
			notes: "Valve replaced",
		});
	});

	it("clears a field emptied by the user", () => {
		const after = { ...before, title: " " };
		expect(patchOf(before, after, new Set(FIELDS))).toEqual({ title: null });
	});

	it("leaves out fields the user may not change", () => {
		const after = { ...before, title: "Other", status: "done" };
		expect(patchOf(before, after, new Set(PROGRESS_FIELDS))).toEqual({
			status: "done",
		});
	});
});
