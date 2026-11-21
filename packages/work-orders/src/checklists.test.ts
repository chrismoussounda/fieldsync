import { describe, expect, it } from "vitest";
import { isValidChecklistPatch, mayChangeItem } from "./index.ts";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const tech = { id: ME, role: "technician" as const };
const office = { id: OTHER, role: "dispatcher" as const };
const mine = { assigneeId: ME };
const theirs = { assigneeId: OTHER };
const item = { orderId: ORDER, label: "Close the valve", position: 1 };
const tick = { done: true, doneBy: ME, doneAt: "2026-11-21T10:00:00.000Z" };

describe("isValidChecklistPatch", () => {
	it("accepts an item and its tick", () => {
		expect(isValidChecklistPatch({ ...item, ...tick })).toBe(true);
		expect(
			isValidChecklistPatch({ done: false, doneBy: null, doneAt: null }),
		).toBe(true);
	});

	it("refuses odd values and unknown fields", () => {
		expect(isValidChecklistPatch({ label: " " })).toBe(false);
		expect(isValidChecklistPatch({ position: "first" })).toBe(false);
		expect(isValidChecklistPatch({ done: "yes" })).toBe(false);
		expect(isValidChecklistPatch({ title: "x" })).toBe(false);
	});
});

describe("mayChangeItem", () => {
	it("lets the office write, tick and remove items", () => {
		expect(mayChangeItem(office, theirs, null, item, "upsert")).toBe(true);
		expect(
			mayChangeItem(office, theirs, item, { label: "Open it" }, "upsert"),
		).toBe(true);
		expect(mayChangeItem(office, theirs, item, {}, "delete")).toBe(true);
	});

	it("lets the assigned technician tick items, in their own name only", () => {
		expect(mayChangeItem(tech, mine, item, tick, "upsert")).toBe(true);
		expect(
			mayChangeItem(tech, mine, item, { ...tick, doneBy: OTHER }, "upsert"),
		).toBe(false);
		expect(mayChangeItem(tech, theirs, item, tick, "upsert")).toBe(false);
		expect(
			mayChangeItem(tech, mine, item, { label: "Skip it" }, "upsert"),
		).toBe(false);
		expect(mayChangeItem(tech, mine, null, item, "upsert")).toBe(false);
		expect(mayChangeItem(tech, mine, item, {}, "delete")).toBe(false);
	});

	it("keeps an item on its order, and needs the order to exist", () => {
		expect(
			mayChangeItem(office, theirs, item, { orderId: OTHER }, "upsert"),
		).toBe(false);
		expect(mayChangeItem(office, null, null, item, "upsert")).toBe(false);
		expect(mayChangeItem(office, theirs, null, { label: "x" }, "upsert")).toBe(
			false,
		);
	});
});
