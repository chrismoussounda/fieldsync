import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// One server per copy of the function, built on its first request.
let ready: Promise<FastifyInstance> | undefined;

async function start(): Promise<FastifyInstance> {
	const { app } = await createApp(loadConfig());
	await app.ready();
	return app;
}

/** The API as a Vercel function: the web app calls it under /api. */
export default async function handler(
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	ready ??= start().catch((error: unknown) => {
		ready = undefined;
		throw error;
	});
	const app = await ready;
	request.url = apiPath(request.url ?? "/");
	app.server.emit("request", request, response);
}

/** The route's own path: without the /api prefix, and without the one the
 * hosting rewrite may have added to the query. */
export function apiPath(url: string): string {
	const parsed = new URL(url, "http://local");
	const rewritten = parsed.searchParams.get("__path");
	parsed.searchParams.delete("__path");
	const path = (rewritten ?? parsed.pathname).replace(/^\/api(?=\/|$)/, "");
	return `${path || "/"}${parsed.search}`;
}
