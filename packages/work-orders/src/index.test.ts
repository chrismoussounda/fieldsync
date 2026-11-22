import { describe, expect, it } from "vitest";
import {
	editableFields,
	FIELDS,
	isValidPatch,
	isValidValue,
	PROGRESS_FIELDS,
} from "./index.ts";

const order = { title: "Fix pump", assigneeId: "me" };

describe("editableFields", () => {
	it("lets dispatchers and admins change everything", () => {
		for (const role of ["dispatcher", "admin"] as const) {
			expect([...editableFields({ id: "x", role }, order)]).toEqual(FIELDS);
		}
	});

	it("lets a technician report progress on their own orders only", () => {
		const tech = (id: string) =>
			editableFields({ id, role: "technician" }, order);
		expect([...tech("me")]).toEqual(PROGRESS_FIELDS);
		expect(tech("someone else").size).toBe(0);
		expect(editableFields({ id: "me", role: "technician" }, null).size).toBe(0);
	});
});

describe("isValidValue", () => {
	it("accepts the known choices only", () => {
		expect(isValidValue("status", "done")).toBe(true);
		expect(isValidValue("status", "banana")).toBe(false);
		expect(isValidValue("priority", "urgent")).toBe(true);
		expect(isValidValue("priority", 3)).toBe(false);
	});

	it("accepts real dates and ids", () => {
		expect(isValidValue("dueDate", "2026-12-01")).toBe(true);
		expect(isValidValue("dueDate", "2026-13-40")).toBe(false);
		expect(isValidValue("dueDate", "2026-02-30")).toBe(false);
		expect(isValidValue("dueDate", "tomorrow")).toBe(false);
		expect(
			isValidValue("assigneeId", "00000000-0000-4000-8000-0000000000b1"),
		).toBe(true);
		expect(isValidValue("assigneeId", "me")).toBe(false);
	});

	it("bounds text and keeps the title", () => {
		expect(isValidValue("notes", "Valve replaced")).toBe(true);
		expect(isValidValue("notes", "x".repeat(5001))).toBe(false);
		expect(isValidValue("title", "   ")).toBe(false);
		expect(isValidValue("notes", null)).toBe(true);
		expect(isValidValue("title", null)).toBe(false);
	});

	it("takes a point on the map", () => {
		expect(isValidValue("location", { lat: -4.27, lng: 15.28 })).toBe(true);
		expect(isValidValue("location", null)).toBe(true);
		expect(isValidValue("location", { lat: 0, lng: 181 })).toBe(false);
		expect(isValidValue("location", [0, 0])).toBe(false);
	});

	it("refuses fields that do not exist", () => {
		expect(isValidPatch({ price: "100" })).toBe(false);
		expect(isValidPatch({ status: "done", notes: null })).toBe(true);
	});
});
