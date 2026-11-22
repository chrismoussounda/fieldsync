import rateLimit from "@fastify/rate-limit";
import { PROTOCOL_VERSION } from "@fieldsync/protocol";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@fieldsync/work-orders";
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	type FastifyRequest,
	type FastifyServerOptions,
} from "fastify";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { listDevices, revokeDevice } from "../auth/devices.ts";
import {
	audienceOf,
	isValidRecord,
	mayWrite,
	technicianIds,
	WORK_ORDER_SCOPING,
} from "../auth/policy.ts";
import {
	type AuthConfig,
	authenticate,
	login,
	type Principal,
	refresh,
} from "../auth/session.ts";
import {
	addUser,
	changePassword,
	listMembers,
	MIN_PASSWORD,
	resetPassword,
	setActive,
	updateUser,
} from "../auth/team.ts";
import { normalizeEmail } from "../auth/users.ts";
import { listConflicts, reviewConflict } from "../conflicts.ts";
import type { Database } from "../db/schema.ts";
import { ApiError } from "../errors.ts";
import { entityHistory } from "../history.ts";
import { readPhotoFile, storePhotoFile } from "../photos.ts";
import { handleGetEntity } from "../sync/entity.ts";
import { handlePull, MAX_PULL_LIMIT } from "../sync/pull.ts";
import { handlePush } from "../sync/push.ts";
import { postgresStore } from "./rate-store.ts";

/** Requests allowed: sign-ins per account and address per 15 minutes,
 * refreshes per address and sync requests per device, per minute. */
export type Limits = { login: number; refresh: number; sync: number };

export const DEFAULT_LIMITS: Limits = { login: 10, refresh: 60, sync: 300 };

export type ServerOptions = {
	db: Kysely<Database>;
	/** Signs access tokens; at least 32 bytes. */
	secret: Uint8Array;
	now?: () => number;
	logger?: FastifyServerOptions["logger"];
	limits?: Limits;
	/** Read the client address from X-Forwarded-For, behind a proxy. */
	trustProxy?: boolean;
};

const rateLimited = () => new ApiError(429, "RATE_LIMITED");

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

const Password = z.string().min(MIN_PASSWORD).max(256);
const RoleName = z.enum(["technician", "dispatcher", "admin"]);

const NewUserBody = z.object({
	email: z.email().max(254),
	name: z.string().trim().min(1).max(100),
	role: RoleName,
	password: Password,
});

const UserChanges = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	role: RoleName.optional(),
});

const PasswordReset = z.object({ password: Password });

const PasswordChange = z.object({
	current: z.string().min(1).max(256),
	next: Password,
});

const IdParams = z.object({ id: z.uuid() });

const ConflictsQuery = z.object({
	open: z.enum(["true", "false"]).default("true"),
});

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
	limits = DEFAULT_LIMITS,
	trustProxy = false,
}: ServerOptions): FastifyInstance {
	const app = Fastify({ logger, bodyLimit: 1024 * 1024, trustProxy });
	const config: AuthConfig = { secret, now };

	app.setErrorHandler((error: FastifyError, request, reply) => {
		if (error instanceof z.ZodError) {
			return reply.code(400).send({ error: "BAD_REQUEST" });
		}
		const status = error.statusCode ?? 500;
		if (status >= 500) {
			request.log.error(error);
			return reply.code(500).send({ error: "INTERNAL" });
		}
		// Fastify's own codes describe its internals; clients get ours.
		const code = error instanceof ApiError ? error.code : "BAD_REQUEST";
		return reply.code(status).send({ error: code });
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

	app.register(async (auth) => {
		// After parsing, so a sign-in is counted per account, not only per address.
		await auth.register(rateLimit, {
			global: false,
			store: postgresStore(db),
			hook: "preHandler",
			errorResponseBuilder: rateLimited,
		});

		auth.post(
			"/auth/login",
			{
				config: {
					rateLimit: {
						max: limits.login,
						timeWindow: "15 minutes",
						keyGenerator: (request) => {
							const { email } = (request.body ?? {}) as { email?: unknown };
							return `${request.ip}:${normalizeEmail(String(email ?? ""))}`;
						},
					},
				},
			},
			async (request) => login(db, config, LoginBody.parse(request.body)),
		);

		auth.post(
			"/auth/refresh",
			{
				config: { rateLimit: { max: limits.refresh, timeWindow: "1 minute" } },
			},
			async (request) =>
				refresh(db, config, RefreshBody.parse(request.body).refreshToken),
		);
	});

	// Routes registered after this need a valid access token.
	const secure = (scope: FastifyInstance) => {
		scope.decorateRequest("auth");
		scope.addHook("onRequest", async (request) => {
			request.auth = await authenticate(db, config, bearer(request));
		});
	};

	app.register(async (account) => {
		secure(account);

		account.addContentTypeParser(
			[...PHOTO_TYPES],
			{ parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES },
			(_request, body, done) => done(null, body),
		);

		account.put("/photos/:id", async (request, reply) => {
			const { id } = IdParams.parse(request.params);
			if (!(request.body instanceof Buffer)) {
				throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE");
			}
			await storePhotoFile(
				db,
				request.auth,
				id,
				request.headers["content-type"] ?? "",
				request.body,
			);
			return reply.code(204).send();
		});

		account.get("/photos/:id", async (request, reply) => {
			const { id } = IdParams.parse(request.params);
			const file = await readPhotoFile(db, request.auth, id);
			// An image never changes once stored.
			return reply
				.header("content-type", file.contentType)
				.header("cache-control", "private, max-age=31536000, immutable")
				.send(Buffer.from(file.bytes));
		});

		account.get("/users", async (request) => ({
			users: await listMembers(db, request.auth),
		}));

		account.post("/users", async (request, reply) => {
			const id = await addUser(
				db,
				request.auth,
				NewUserBody.parse(request.body),
			);
			return reply.code(201).send({ id });
		});

		account.patch("/users/:id", async (request, reply) => {
			const { id } = IdParams.parse(request.params);
			await updateUser(db, request.auth, id, UserChanges.parse(request.body));
			return reply.code(204).send();
		});

		for (const [action, active] of [
			["enable", true],
			["disable", false],
		] as const) {
			account.post(`/users/:id/${action}`, async (request, reply) => {
				const { id } = IdParams.parse(request.params);
				await setActive(db, request.auth, id, active, now());
				return reply.code(204).send();
			});
		}

		account.post("/users/:id/password", async (request, reply) => {
			const { id } = IdParams.parse(request.params);
			const { password } = PasswordReset.parse(request.body);
			await resetPassword(db, request.auth, id, password);
			return reply.code(204).send();
		});

		account.post("/me/password", async (request, reply) => {
			const { current, next } = PasswordChange.parse(request.body);
			await changePassword(db, request.auth, current, next);
			return reply.code(204).send();
		});

		account.get("/history/:type/:id", async (request) => {
			const { type, id } = EntityParams.parse(request.params);
			// Only for records this user's devices sync.
			const { entity } = await handleGetEntity(
				db,
				request.auth,
				{ entityType: type, entityId: id },
				{ audience: audienceOf(request.auth), scoping: WORK_ORDER_SCOPING },
			);
			if (!entity) throw new ApiError(404, "NOT_FOUND");
			return { entries: await entityHistory(db, request.auth, type, id) };
		});

		account.get("/conflicts", async (request) => {
			const { open } = ConflictsQuery.parse(request.query);
			return {
				conflicts: await listConflicts(db, request.auth, {
					open: open === "true",
				}),
			};
		});

		account.post("/conflicts/:id/review", async (request, reply) => {
			const { id } = IdParams.parse(request.params);
			await reviewConflict(db, request.auth, id, now());
			return reply.code(204).send();
		});

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
			// Per device, once signed in: an office behind one address is not one client.
			await sync.register(rateLimit, {
				max: limits.sync,
				timeWindow: "1 minute",
				hook: "preHandler",
				keyGenerator: (request) => request.auth.deviceId,
				errorResponseBuilder: rateLimited,
			});

			sync.post("/push", async (request) => {
				const body = PushBody.parse(request.body);
				const technicians = await technicianIds(db, request.auth.orgId);
				return handlePush(db, request.auth, body, {
					validate: (op) => isValidRecord(op, technicians),
					authorize: (op, current, parent) =>
						mayWrite(request.auth, op, current, parent),
					scoping: WORK_ORDER_SCOPING,
					now,
				});
			});

			sync.get("/pull", async (request) =>
				handlePull(db, request.auth, PullQuery.parse(request.query), {
					now,
					audience: audienceOf(request.auth),
				}),
			);

			sync.get("/entities/:type/:id", async (request) => {
				const { type, id } = EntityParams.parse(request.params);
				return handleGetEntity(
					db,
					request.auth,
					{ entityType: type, entityId: id },
					{
						now,
						audience: audienceOf(request.auth),
						scoping: WORK_ORDER_SCOPING,
					},
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
