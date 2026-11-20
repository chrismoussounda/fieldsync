import { describe, expect, it } from "vitest";
import { deviceName } from "./device-name.ts";

describe("deviceName", () => {
	it("names common browsers and systems", () => {
		const cases: [string, string][] = [
			[
				"Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
				"Chrome on Android",
			],
			[
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
				"Safari on iPhone",
			],
			[
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
				"Edge on Windows",
			],
			[
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
				"Firefox on macOS",
			],
		];
		for (const [agent, name] of cases) expect(deviceName(agent)).toBe(name);
	});

	it("falls back to a plain name", () => {
		expect(deviceName("")).toBe("Browser");
	});
});
