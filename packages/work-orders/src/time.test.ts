import { describe, expect, it } from "vitest";
import {
	formatMinutes,
	isValidTimePatch,
	mayChangeTime,
	minutesBetween,
} from "./index.ts";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const tech = { id: ME, role: "technician" as const };
const office = { id: OTHER, role: "dispatcher" as const };
const mine = { assigneeId: ME };
const start = {
	orderId: ORDER,
	technicianId: ME,
	startedAt: "2026-11-21T08:00:00.000Z",
	endedAt: null,
};
const stop = { endedAt: "2026-11-21T09:30:00.000Z" };

describe("isValidTimePatch", () => {
	it("accepts a start and a stop", () => {
		expect(isValidTimePatch(start)).toBe(true);
		expect(isValidTimePatch(stop)).toBe(true);
	});

	it("refuses a stop before the start, and odd values", () => {
		expect(
			isValidTimePatch({ ...start, endedAt: "2026-11-21T07:00:00.000Z" }),
		).toBe(false);
		expect(isValidTimePatch({ startedAt: "soon" })).toBe(false);
		expect(isValidTimePatch({ hours: 2 })).toBe(false);
	});
});

describe("mayChangeTime", () => {
	it("lets the assigned technician start and stop their own clock", () => {
		expect(mayChangeTime(tech, mine, null, start, "upsert")).toBe(true);
		expect(mayChangeTime(tech, mine, start, stop, "upsert")).toBe(true);
	});

	it("keeps technicians off others' time and others' orders", () => {
		expect(
			mayChangeTime(
				tech,
				mine,
				null,
				{ ...start, technicianId: OTHER },
				"upsert",
			),
		).toBe(false);
		expect(
			mayChangeTime(
				tech,
				mine,
				{ ...start, technicianId: OTHER },
				stop,
				"upsert",
			),
		).toBe(false);
		expect(
			mayChangeTime(tech, { assigneeId: OTHER }, null, start, "upsert"),
		).toBe(false);
		expect(mayChangeTime(tech, mine, start, {}, "delete")).toBe(false);
	});

	it("lets the office correct and remove entries, never move them", () => {
		expect(mayChangeTime(office, mine, start, stop, "upsert")).toBe(true);
		expect(mayChangeTime(office, mine, start, {}, "delete")).toBe(true);
		expect(
			mayChangeTime(office, mine, start, { technicianId: OTHER }, "upsert"),
		).toBe(false);
		const early = { endedAt: "2026-11-21T07:00:00.000Z" };
		expect(mayChangeTime(office, mine, start, early, "upsert")).toBe(false);
	});
});

describe("durations", () => {
	it("count whole minutes, up to now while running", () => {
		expect(minutesBetween(start.startedAt, stop.endedAt, 0)).toBe(90);
		expect(
			minutesBetween(
				start.startedAt,
				null,
				Date.parse("2026-11-21T08:10:30.000Z"),
			),
		).toBe(10);
	});

	it("read as hours and minutes", () => {
		expect(formatMinutes(45)).toBe("45 min");
		expect(formatMinutes(65)).toBe("1 h 05");
	});
});
