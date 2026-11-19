import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Starting an in-memory Postgres is slow while the simulation uses every core.
		hookTimeout: 60_000,
	},
});
