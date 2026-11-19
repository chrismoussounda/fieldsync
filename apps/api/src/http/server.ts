import { PROTOCOL_VERSION } from "@fieldsync/protocol";
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	type FastifyRequest,
	type FastifyServerOptions,
} from "fastify";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { listDevices, revokeDevice } from "../auth/devices.ts";
import { mayWrite } from "../auth/policy.ts";
import {
	type AuthConfig,
	authenticate,
	login,
	type Principal,
	refresh,
} from "../auth/session.ts";
import { listUsers } from "../auth/users.ts";
import type { Database } from "../db/schema.ts";
import { ApiError } from "../errors.ts";
import { handleGetEntity } from "../sync/entity.ts";
import { handlePull, MAX_PULL_LIMIT } from "../sync/pull.ts";
import { handlePush } from "../sync/push.ts";

export type ServerOptions = {
	db: Kysely<Database>;
	/** Signs access tokens; at least 32 bytes. */
	secret: Uint8Array;
	now?: () => number;
	logger?: FastifyServerOptions["logger"];
};

const MAX_PUSH_OPS = 100;

const LoginBody = z.object({
	email: z.string().min(1).max(254),
	password: z.string().min(1).max(256),
	deviceId: z.uuid(),
	deviceName: z.string().min(1).max(100),
});

const RefreshBody = z.object({ refreshToken: z.string().min(1).max(100) });

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

const DeviceParams = z.object({ id: z.uuid() });

declare module "fastify" {
	interface FastifyRequest {
		auth: Principal;
	}
}

export function buildServer({
	db,
	secret,
	now = Date.now,
	logger = false,
}: ServerOptions): FastifyInstance {
	const app = Fastify({ logger, bodyLimit: 1024 * 1024 });
	const config: AuthConfig = { secret, now };

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

	app.post("/auth/login", async (request) =>
		login(db, config, LoginBody.parse(request.body)),
	);

	app.post("/auth/refresh", async (request) =>
		refresh(db, config, RefreshBody.parse(request.body).refreshToken),
	);

	// Routes registered after this need a valid access token.
	const secure = (scope: FastifyInstance) => {
		scope.decorateRequest("auth");
		scope.addHook("onRequest", async (request) => {
			request.auth = await authenticate(db, config, bearer(request));
		});
	};

	app.register(async (account) => {
		secure(account);

		account.get("/users", async (request) => ({
			users: await listUsers(db, request.auth),
		}));

		account.get("/devices", async (request) => ({
			devices: await listDevices(db, request.auth),
		}));

		account.post("/devices/:id/revoke", async (request, reply) => {
			const { id } = DeviceParams.parse(request.params);
			await revokeDevice(db, request.auth, id, now());
			return reply.code(204).send();
		});
	});

	app.register(
		async (sync) => {
			// Checked before the token, so an outdated app is told to update first.
			sync.addHook("onRequest", async (request, reply) => {
				if (request.headers["x-protocol-version"] !== PROTOCOL_VERSION) {
					return reply.code(426).send({ error: "UNSUPPORTED_PROTOCOL" });
				}
			});
			secure(sync);

			sync.post("/push", async (request) =>
				handlePush(db, request.auth, PushBody.parse(request.body), {
					authorize: (op, current) => mayWrite(request.auth, op, current),
					now,
				}),
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

function bearer(request: FastifyRequest): string {
	const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
	if (scheme !== "Bearer" || !token) throw new ApiError(401, "UNAUTHORIZED");
	return token;
}
