import { PROTOCOL_VERSION } from "@fieldsync/protocol";
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	type FastifyRequest,
	type FastifyServerOptions,
} from "fastify";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import type { Database } from "../db/schema.ts";
import { handleGetEntity } from "../sync/entity.ts";
import { handlePull, MAX_PULL_LIMIT } from "../sync/pull.ts";
import { type Auth, handlePush } from "../sync/push.ts";

export type Authenticate = (request: FastifyRequest) => Promise<Auth | null>;

export type ServerOptions = {
	db: Kysely<Database>;
	authenticate: Authenticate;
	now?: () => number;
	logger?: FastifyServerOptions["logger"];
};

const MAX_PUSH_OPS = 100;

const PushBody = z.object({ ops: z.array(z.unknown()).max(MAX_PUSH_OPS) });

const PullQuery = z.object({
	cursor: z.coerce.number().int().min(0),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_PULL_LIMIT)
		.default(MAX_PULL_LIMIT),
});

const EntityParams = z.object({ type: z.string().min(1), id: z.uuid() });

declare module "fastify" {
	interface FastifyRequest {
		auth: Auth;
	}
}

export function buildServer({
	db,
	authenticate,
	now = Date.now,
	logger = false,
}: ServerOptions): FastifyInstance {
	const app = Fastify({ logger, bodyLimit: 1024 * 1024 });

	app.setErrorHandler((error: FastifyError, request, reply) => {
		if (error instanceof z.ZodError) {
			return reply.code(400).send({ error: "BAD_REQUEST" });
		}
		const status = error.statusCode ?? 500;
		if (status >= 500) request.log.error(error);
		return reply
			.code(status)
			.send({ error: status >= 500 ? "INTERNAL" : error.code });
	});

	app.get("/healthz", async () => ({ status: "ok" }));

	app.get("/readyz", async (_request, reply) => {
		try {
			await sql`select 1`.execute(db);
			return { status: "ok" };
		} catch {
			return reply.code(503).send({ status: "unavailable" });
		}
	});

	app.register(
		async (sync) => {
			sync.decorateRequest("auth");
			sync.addHook("onRequest", async (request, reply) => {
				if (request.headers["x-protocol-version"] !== PROTOCOL_VERSION) {
					return reply.code(426).send({ error: "UNSUPPORTED_PROTOCOL" });
				}
				const auth = await authenticate(request);
				if (!auth) return reply.code(401).send({ error: "UNAUTHORIZED" });
				request.auth = auth;
			});

			sync.post("/push", async (request) =>
				handlePush(db, request.auth, PushBody.parse(request.body), now),
			);

			sync.get("/pull", async (request) =>
				handlePull(db, request.auth, PullQuery.parse(request.query), now),
			);

			sync.get("/entities/:type/:id", async (request) => {
				const { type, id } = EntityParams.parse(request.params);
				return handleGetEntity(
					db,
					request.auth,
					{ entityType: type, entityId: id },
					now,
				);
			});
		},
		{ prefix: "/sync" },
	);

	return app;
}
