import { expect, it } from "vitest";
import { type Entry, minutesByTechnician } from "./timesheet.ts";

const entry = (
	technicianId: string,
	startedAt: string,
	endedAt: string | null,
): Entry => ({
	id: crypto.randomUUID(),
	orderId: "o1",
	technicianId,
	startedAt,
	endedAt,
});

it("adds up each technician's time since a date, running clocks up to now", () => {
	const now = Date.parse("2026-11-21T12:00:00.000Z");
	const since = Date.parse("2026-11-14T12:00:00.000Z");
	const totals = minutesByTechnician(
		[
			entry("junior", "2026-11-20T08:00:00.000Z", "2026-11-20T09:30:00.000Z"),
			entry("junior", "2026-11-21T11:00:00.000Z", null),
			entry("junior", "2026-11-01T08:00:00.000Z", "2026-11-01T10:00:00.000Z"),
			entry(
				"merveille",
				"2026-11-21T10:00:00.000Z",
				"2026-11-21T10:45:00.000Z",
			),
		],
		since,
		now,
	);
	expect(totals).toEqual(
		new Map([
			["junior", 150],
			["merveille", 45],
		]),
	);
});
