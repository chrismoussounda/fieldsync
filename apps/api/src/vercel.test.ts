import { describe, expect, it } from "vitest";
import { apiPath } from "./vercel.ts";

describe("apiPath", () => {
	it("drops the /api prefix the web app calls through", () => {
		expect(apiPath("/api/sync/pull?cursor=4")).toBe("/sync/pull?cursor=4");
		expect(apiPath("/api")).toBe("/");
		expect(apiPath("/apiary")).toBe("/apiary");
	});

	it("takes the path a rewrite moved into the query, keeping the rest", () => {
		expect(apiPath("/api?__path=/sync/pull&cursor=4")).toBe(
			"/sync/pull?cursor=4",
		);
	});
});
