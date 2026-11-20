import { defineConfig } from "@playwright/test";

export const API_PORT = 3999;
const WEB_PORT = 5199;

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	globalSetup: "./e2e/setup.ts",
	// The tests share one demo org.
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: `http://localhost:${WEB_PORT}`,
		// The Chrome already installed, locally and on GitHub's runners.
		channel: "chrome",
		trace: "retain-on-failure",
	},
	webServer: {
		// The production build, since the service worker only exists there.
		command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
		url: `http://localhost:${WEB_PORT}`,
		env: { FIELDSYNC_API: `http://127.0.0.1:${API_PORT}` },
	},
});
