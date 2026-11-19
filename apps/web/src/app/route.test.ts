import { describe, expect, it } from "vitest";
import { parseRoute, ROUTES } from "./route.ts";

const ID = "00000000-0000-4000-8000-0000000000aa";

describe("parseRoute", () => {
	it("reads the screens back from their links", () => {
		expect(parseRoute(ROUTES.order(ID))).toEqual({ name: "order", id: ID });
		expect(parseRoute(ROUTES.new)).toEqual({ name: "new" });
		expect(parseRoute(ROUTES.debug)).toEqual({ name: "debug" });
		expect(parseRoute(ROUTES.list)).toEqual({ name: "list" });
	});

	it("falls back to the list for anything else", () => {
		expect(parseRoute("")).toEqual({ name: "list" });
		expect(parseRoute("#/orders/not-an-id")).toEqual({ name: "list" });
	});
});
