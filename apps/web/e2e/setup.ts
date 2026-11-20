import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { API_PORT } from "../playwright.config.ts";

const API_DIR = fileURLToPath(new URL("../../api", import.meta.url));

/** A fresh Postgres with the demo org, and the real API in front of it. */
export default async function setup() {
	const container = await new PostgreSqlContainer("postgres:16-alpine").start();
	const env = {
		...process.env,
		DATABASE_URL: container.getConnectionUri(),
		JWT_SECRET: randomBytes(32).toString("base64"),
		HOST: "127.0.0.1",
		PORT: String(API_PORT),
		LOG_LEVEL: "warn",
		DEMO_PASSWORD: randomBytes(12).toString("base64url"),
	};
	await exited(
		spawn("node", ["src/seed.ts"], { cwd: API_DIR, env, stdio: "inherit" }),
	);
	const api = spawn("node", ["src/main.ts"], {
		cwd: API_DIR,
		env,
		stdio: "inherit",
	});
	await ready(`http://127.0.0.1:${API_PORT}/readyz`);
	// Read by the tests, which run after this in child processes.
	process.env.DEMO_PASSWORD = env.DEMO_PASSWORD;

	return async () => {
		api.kill();
		await container.stop();
	};
}

function exited(child: ChildProcess): Promise<void> {
	return new Promise((resolve, reject) =>
		child.on("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
		),
	);
}

async function ready(url: string): Promise<void> {
	for (let i = 0; i < 100; i++) {
		const ok = await fetch(url).then(
			(r) => r.ok,
			() => false,
		);
		if (ok) return;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`${url} never became ready`);
}
