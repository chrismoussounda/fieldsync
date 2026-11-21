import { describe, expect, it } from "vitest";
import { isValidPartPatch, mayChangePart } from "./index.ts";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const tech = { id: ME, role: "technician" as const };
const office = { id: OTHER, role: "dispatcher" as const };
const mine = { assigneeId: ME };
const theirs = { assigneeId: OTHER };
const part = {
	orderId: ORDER,
	name: "Pump seal 32 mm",
	quantity: 2,
	unit: "pcs",
	addedBy: ME,
	addedAt: "2026-11-21T10:00:00.000Z",
};

describe("isValidPartPatch", () => {
	it("accepts a part, decimals and no unit", () => {
		expect(isValidPartPatch(part)).toBe(true);
		expect(isValidPartPatch({ quantity: 1.5, unit: null })).toBe(true);
	});

	it("refuses odd values and unknown fields", () => {
		expect(isValidPartPatch({ name: " " })).toBe(false);
		expect(isValidPartPatch({ quantity: 0 })).toBe(false);
		expect(isValidPartPatch({ quantity: "2" })).toBe(false);
		expect(isValidPartPatch({ quantity: Number.POSITIVE_INFINITY })).toBe(
			false,
		);
		expect(isValidPartPatch({ unit: "x".repeat(21) })).toBe(false);
		expect(isValidPartPatch({ price: 10 })).toBe(false);
	});
});

describe("mayChangePart", () => {
	it("lets the assigned technician add, correct and remove their own parts", () => {
		expect(mayChangePart(tech, mine, null, part, "upsert")).toBe(true);
		expect(mayChangePart(tech, mine, part, { quantity: 3 }, "upsert")).toBe(
			true,
		);
		expect(mayChangePart(tech, mine, part, {}, "delete")).toBe(true);
	});

	it("keeps technicians to their own parts on their own orders", () => {
		expect(
			mayChangePart(tech, mine, null, { ...part, addedBy: OTHER }, "upsert"),
		).toBe(false);
		expect(
			mayChangePart(tech, mine, { ...part, addedBy: OTHER }, {}, "delete"),
		).toBe(false);
		expect(mayChangePart(tech, theirs, null, part, "upsert")).toBe(false);
	});

	it("lets the office do anything but move a part", () => {
		expect(mayChangePart(office, theirs, null, part, "upsert")).toBe(true);
		expect(
			mayChangePart(office, theirs, part, { name: "Seal" }, "upsert"),
		).toBe(true);
		expect(mayChangePart(office, theirs, part, {}, "delete")).toBe(true);
		expect(
			mayChangePart(office, theirs, part, { orderId: OTHER }, "upsert"),
		).toBe(false);
		expect(
			mayChangePart(office, theirs, part, { addedBy: OTHER }, "upsert"),
		).toBe(false);
	});

	it("needs the order and a whole part to start", () => {
		expect(mayChangePart(office, null, null, part, "upsert")).toBe(false);
		expect(
			mayChangePart(office, theirs, null, { name: "Seal" }, "upsert"),
		).toBe(false);
	});
});
