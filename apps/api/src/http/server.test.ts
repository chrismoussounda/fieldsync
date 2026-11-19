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

let db: Kysely<Database>;
let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
	db = await createTestDb();
	app = buildServer({
		db,
		secret: new TextEncoder().encode("a test secret of at least 32 bytes"),
	});
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
	return response.json() as { accessToken: string; refreshToken: string };
}

async function syncHeaders() {
	const { accessToken } = await signIn("tech@example.com", PHONE);
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
		const { accessToken } = await signIn(email, deviceId);
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
		return { client, storage };
	}

	it("syncs two devices through the real server", async () => {
		const phone = await device("tech@example.com", PHONE);
		const office = await device("dispatch@example.com", OFFICE);
		const target = { entityType: "work_order", entityId: ORDER };

		await office.client.mutate({
			...target,
			patch: { status: "assigned", priority: "normal" },
		});
		await office.client.syncOnce();
		await phone.client.syncOnce();
		await phone.client.mutate({ ...target, patch: { status: "in_progress" } });
		await office.client.mutate({ ...target, patch: { priority: "urgent" } });
		await phone.client.syncOnce();
		await office.client.syncOnce();
		await phone.client.syncOnce();

		const merged = { status: "in_progress", priority: "urgent" };
		const key = `work_order:${ORDER}`;
		expect(phone.storage.entities.get(key)?.fields).toEqual(merged);
		expect(office.storage.entities.get(key)?.fields).toEqual(merged);
	});

	it("reports an HTTP error with its code", async () => {
		const transport = new HttpTransport({
			baseUrl,
			getToken: async () => null,
		});
		await expect(transport.pull({ cursor: 0, limit: 10 })).rejects.toEqual(
			new HttpError(401, "UNAUTHORIZED"),
		);
	});
});
