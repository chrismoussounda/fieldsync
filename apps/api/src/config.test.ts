import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const valid = {
	DATABASE_URL: "postgres://fieldsync:pw@localhost:5432/fieldsync",
	JWT_SECRET: "s".repeat(32),
};

describe("loadConfig", () => {
	it("applies defaults", () => {
		expect(loadConfig(valid)).toMatchObject({
			HOST: "0.0.0.0",
			PORT: 3000,
			LOG_LEVEL: "info",
			TRUST_PROXY: false,
		});
	});

	it("names the invalid variables without printing their values", () => {
		const secret = "too short";
		const load = () =>
			loadConfig({ ...valid, JWT_SECRET: secret, PORT: "eighty" });
		expect(load).toThrow("Invalid environment: JWT_SECRET, PORT");
		expect(load).not.toThrow(secret);
	});

	it("requires a Postgres URL", () => {
		expect(() =>
			loadConfig({ ...valid, DATABASE_URL: "mysql://localhost/db" }),
		).toThrow("DATABASE_URL");
	});
});
