import { expect, it } from "vitest";
import { ago } from "./time.ts";

it("says how long ago, in the largest whole unit", () => {
	const now = Date.parse("2026-11-20T12:00:00Z");
	expect(ago("2026-11-20T11:59:30Z", now)).toBe("now");
	expect(ago("2026-11-20T11:55:00Z", now)).toBe("5 minutes ago");
	expect(ago("2026-11-20T11:00:00Z", now)).toBe("1 hour ago");
	expect(ago("2026-11-18T09:00:00Z", now)).toBe("2 days ago");
	expect(ago("2026-11-20T11:55:00Z", now, "fr")).toBe("il y a 5 minutes");
});
