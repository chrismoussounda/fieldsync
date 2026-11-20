import { encode } from "@fieldsync/hlc";
import { PROTOCOL_VERSION } from "@fieldsync/protocol";
import {
	HttpError,
	HttpTransport,
	MemoryStorage,
	SyncClient,
} from "@fieldsync/sync-client";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth/users.ts";
import type { Database, Role } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { buildServer } from "./server.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const PASSWORD = "correct horse";
const SECRET = new TextEncoder().encode("a test secret of at least 32 bytes");
const GENEROUS = { login: 1000, refresh: 1000, sync: 1000 };

let db: Kysely<Database>;
let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
	db = await createTestDb();
	// These tests sign in many times from one address; limits are tested below.
	app = buildServer({ db, secret: SECRET, limits: GENEROUS });
	baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
});

beforeEach(async () => {
	await emptyTestDb(db);
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
	const users: [string, Role][] = [
		["tech@example.com", "technician"],
		["dispatch@example.com", "dispatcher"],
		["admin@example.com", "admin"],
	];
	for (const [email, role] of users) {
		await createUser(db, {
			orgId: ORG,
			email,
			name: role,
			password: PASSWORD,
			role,
		});
	}
});

afterAll(async () => {
	await app.close();
	await db.destroy();
});

async function signIn(email: string, deviceId: string) {
	const response = await app.inject({
		method: "POST",
		url: "/auth/login",
		payload: { email, password: PASSWORD, deviceId, deviceName: "Phone" },
	});
	expect(response.statusCode).toBe(200);
	return response.json() as {
		accessToken: string;
		refreshToken: string;
		user: { id: string };
	};
}

async function syncHeaders(email = "dispatch@example.com") {
	const { accessToken } = await signIn(email, PHONE);
	return {
		"x-protocol-version": PROTOCOL_VERSION,
		authorization: `Bearer ${accessToken}`,
	};
}

function op(patch: Record<string, string>) {
	return {
		opId: crypto.randomUUID(),
		deviceId: PHONE,
		entityType: "work_order",
		entityId: ORDER,
		kind: "upsert",
		patch,
		base: {},
		hlc: encode({ wall: Date.now(), counter: 0, node: "0a1b2c3d" }),
		clientVersion: "0.1.0",
	};
}

describe("health", () => {
	it("reports the process and the database as up", async () => {
		expect((await app.inject("/healthz")).json()).toEqual({ status: "ok" });
		expect((await app.inject("/readyz")).json()).toEqual({ status: "ok" });
	});
});

describe("auth routes", () => {
	it("log in and refresh", async () => {
		const { refreshToken } = await signIn("tech@example.com", PHONE);
		const response = await app.inject({
			method: "POST",
			url: "/auth/refresh",
			payload: { refreshToken },
		});
		expect(response.json()).toMatchObject({
			user: { role: "technician" },
			expiresIn: 900,
		});
	});

	it("refuse a wrong password", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/auth/login",
			payload: {
				email: "tech@example.com",
				password: "wrong",
				deviceId: PHONE,
				deviceName: "Phone",
			},
		});
		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
	});
});

describe("user routes", () => {
	it("list the org's members for any signed-in user", async () => {
		const { accessToken } = await signIn("tech@example.com", PHONE);
		const response = await app.inject({
			url: "/users",
			headers: { authorization: `Bearer ${accessToken}` },
		});
		expect(response.json().users.map((u: { role: string }) => u.role)).toEqual([
			"admin",
			"dispatcher",
			"technician",
		]);
		expect(response.json().users[0]).not.toHaveProperty("password_hash");
	});
});

describe("team routes", () => {
	async function as(email: string, device: string) {
		const { accessToken } = await signIn(email, device);
		return { authorization: `Bearer ${accessToken}` };
	}

	it("let an admin add a user, and nobody else", async () => {
		const user = {
			email: "new@example.com",
			name: "New",
			role: "technician",
			password: "long enough password",
		};
		const byAdmin = await app.inject({
			method: "POST",
			url: "/users",
			headers: await as("admin@example.com", OFFICE),
			payload: user,
		});
		expect(byAdmin.statusCode).toBe(201);
		const byDispatcher = await app.inject({
			method: "POST",
			url: "/users",
			headers: await as("dispatch@example.com", PHONE),
			payload: { ...user, email: "other@example.com" },
		});
		expect(byDispatcher.statusCode).toBe(403);
	});

	it("refuse a short new password", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/me/password",
			headers: await as("tech@example.com", PHONE),
			payload: { current: PASSWORD, next: "short" },
		});
		expect(response.statusCode).toBe(400);
	});
});

describe("conflict routes", () => {
	it("list conflicts for dispatchers only", async () => {
		const asRole = async (email: string, device: string) => {
			const { accessToken } = await signIn(email, device);
			return app.inject({
				url: "/conflicts?open=false",
				headers: { authorization: `Bearer ${accessToken}` },
			});
		};
		const dispatcher = await asRole("dispatch@example.com", OFFICE);
		expect(dispatcher.json()).toEqual({ conflicts: [] });
		expect((await asRole("tech@example.com", PHONE)).statusCode).toBe(403);
	});

	it("refuse to review an unknown conflict", async () => {
		const { accessToken } = await signIn("dispatch@example.com", OFFICE);
		const response = await app.inject({
			method: "POST",
			url: `/conflicts/${crypto.randomUUID()}/review`,
			headers: { authorization: `Bearer ${accessToken}` },
		});
		expect(response.statusCode).toBe(404);
	});
});

describe("device routes", () => {
	it("are for admins only", async () => {
		const { accessToken } = await signIn("dispatch@example.com", OFFICE);
		const response = await app.inject({
			url: "/devices",
			headers: { authorization: `Bearer ${accessToken}` },
		});
		expect(response.statusCode).toBe(403);
	});

	it("revoke a device, which then cannot sync", async () => {
		const headers = await syncHeaders();
		const admin = await signIn("admin@example.com", OFFICE);
		const asAdmin = { authorization: `Bearer ${admin.accessToken}` };

		const list = await app.inject({ url: "/devices", headers: asAdmin });
		expect(list.json().devices).toHaveLength(2);

		const revoke = await app.inject({
			method: "POST",
			url: `/devices/${PHONE}/revoke`,
			headers: asAdmin,
		});
		expect(revoke.statusCode).toBe(204);

		const pull = await app.inject({ url: "/sync/pull?cursor=0", headers });
		expect(pull.statusCode).toBe(401);
		expect(pull.json()).toEqual({ error: "DEVICE_REVOKED" });
	});

	it("do not reach another org's devices", async () => {
		const admin = await signIn("admin@example.com", OFFICE);
		const response = await app.inject({
			method: "POST",
			url: `/devices/${crypto.randomUUID()}/revoke`,
			headers: { authorization: `Bearer ${admin.accessToken}` },
		});
		expect(response.statusCode).toBe(404);
	});
});

describe("sync routes", () => {
	it("push and pull through HTTP", async () => {
		const headers = await syncHeaders();
		const push = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers,
			payload: { ops: [op({ status: "assigned" })] },
		});
		expect(push.json().results[0].status).toBe("applied");

		const pull = await app.inject({
			url: "/sync/pull?cursor=0",
			headers,
		});
		expect(pull.json()).toMatchObject({
			changes: [{ seq: 1, patch: { status: "assigned" } }],
			hasMore: false,
		});

		const entity = await app.inject({
			url: `/sync/entities/work_order/${ORDER}`,
			headers,
		});
		expect(entity.json().entity.fields).toEqual({ status: "assigned" });
	});

	it("refuse values that make no sense", async () => {
		const admin = await db
			.selectFrom("users")
			.select("id")
			.where("role", "=", "admin")
			.executeTakeFirstOrThrow();
		const response = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers: await syncHeaders(),
			payload: {
				ops: [
					op({ title: "Fix pump", status: "banana" }),
					op({ title: "Fix pump", assigneeId: admin.id }),
				],
			},
		});
		for (const result of response.json().results) {
			expect(result).toMatchObject({
				status: "rejected",
				reason: "INVALID_OP",
			});
		}
	});

	it("refuse an operation the role may not do", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers: await syncHeaders("tech@example.com"),
			payload: { ops: [op({ title: "Not mine to create" })] },
		});
		expect(response.json().results[0]).toMatchObject({
			status: "rejected",
			reason: "FORBIDDEN",
		});
	});

	it("tell an outdated app to update before asking it to sign in", async () => {
		const response = await app.inject({
			url: "/sync/pull?cursor=0",
			headers: { "x-protocol-version": "0" },
		});
		expect(response.statusCode).toBe(426);
		expect(response.json()).toEqual({ error: "UNSUPPORTED_PROTOCOL" });
	});

	it("refuse a request without a valid token", async () => {
		for (const authorization of [
			{},
			{ authorization: "Bearer nope" },
			{ authorization: "Basic abc" },
		]) {
			const response = await app.inject({
				url: "/sync/pull?cursor=0",
				headers: { "x-protocol-version": PROTOCOL_VERSION, ...authorization },
			});
			expect(response.statusCode).toBe(401);
		}
	});

	it("refuse malformed input without leaking details", async () => {
		const headers = await syncHeaders();
		const bad = await Promise.all([
			app.inject({ url: "/sync/pull?cursor=-1", headers }),
			app.inject({ url: "/sync/pull?cursor=0&limit=9999", headers }),
			app.inject({ url: "/sync/entities/work_order/nope", headers }),
			app.inject({
				method: "POST",
				url: "/sync/push",
				headers,
				payload: { ops: "nope" },
			}),
		]);
		for (const response of bad) {
			expect(response.statusCode).toBe(400);
			expect(response.json()).toEqual({ error: "BAD_REQUEST" });
		}
	});

	it("answer the framework's own refusals with our code", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers: { ...(await syncHeaders()), "content-type": "application/json" },
		});
		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({ error: "BAD_REQUEST" });
	});

	it("refuse a batch larger than 100 operations", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers: await syncHeaders(),
			payload: { ops: Array.from({ length: 101 }, () => op({ a: "1" })) },
		});
		expect(response.statusCode).toBe(400);
	});
});

describe("HttpTransport", () => {
	async function device(email: string, deviceId: string) {
		const { accessToken, user } = await signIn(email, deviceId);
		const storage = new MemoryStorage();
		const client = new SyncClient({
			deviceId,
			clientVersion: "0.1.0",
			storage,
			transport: new HttpTransport({
				baseUrl,
				getToken: async () => accessToken,
			}),
		});
		return { client, storage, userId: user.id };
	}

	it("syncs two devices through the real server", async () => {
		const phone = await device("tech@example.com", PHONE);
		const office = await device("dispatch@example.com", OFFICE);
		const target = { entityType: "work_order", entityId: ORDER };

		await office.client.mutate({
			...target,
			patch: {
				status: "assigned",
				priority: "normal",
				assigneeId: phone.userId,
			},
		});
		await office.client.syncOnce();
		await phone.client.syncOnce();
		await phone.client.mutate({ ...target, patch: { status: "in_progress" } });
		await office.client.mutate({ ...target, patch: { priority: "urgent" } });
		await phone.client.syncOnce();
		await office.client.syncOnce();
		await phone.client.syncOnce();

		const merged = {
			status: "in_progress",
			priority: "urgent",
			assigneeId: phone.userId,
		};
		const key = `work_order:${ORDER}`;
		expect(phone.storage.entities.get(key)?.fields).toEqual(merged);
		expect(office.storage.entities.get(key)?.fields).toEqual(merged);
	});

	it("reports an HTTP error with its code", async () => {
		const heard: HttpError[] = [];
		const transport = new HttpTransport({
			baseUrl,
			getToken: async () => null,
			onError: (error) => {
				heard.push(error);
			},
		});
		const refused = new HttpError(401, "UNAUTHORIZED");
		await expect(transport.pull({ cursor: 0, limit: 10 })).rejects.toEqual(
			refused,
		);
		expect(heard).toEqual([refused]);
	});
});

describe("rate limits", () => {
	let limited: FastifyInstance;

	beforeAll(() => {
		limited = buildServer({
			db,
			secret: SECRET,
			limits: { login: 2, refresh: 2, sync: 2 },
		});
	});

	afterAll(() => limited.close());

	const attempt = (email: string) =>
		limited.inject({
			method: "POST",
			url: "/auth/login",
			payload: {
				email,
				password: "wrong",
				deviceId: PHONE,
				deviceName: "Phone",
			},
		});

	it("stop password guessing on one account, not on the others", async () => {
		await attempt("tech@example.com");
		await attempt("TECH@example.com ");
		const blocked = await attempt("tech@example.com");
		expect(blocked.statusCode).toBe(429);
		expect(blocked.json()).toEqual({ error: "RATE_LIMITED" });
		expect(blocked.headers["retry-after"]).toBeDefined();
		expect((await attempt("dispatch@example.com")).statusCode).toBe(401);
	});

	it("count sync requests per device", async () => {
		const headers = await syncHeaders();
		const pull = () => limited.inject({ url: "/sync/pull?cursor=0", headers });
		expect((await pull()).statusCode).toBe(200);
		expect((await pull()).statusCode).toBe(200);
		expect((await pull()).statusCode).toBe(429);
	});
});
