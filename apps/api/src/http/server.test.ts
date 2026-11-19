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
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { type Authenticate, buildServer } from "./server.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";

// Tests sign in with the device id as the token.
const authenticate: Authenticate = async (request) => {
	const token = request.headers.authorization?.replace("Bearer ", "");
	return token ? { orgId: ORG, deviceId: token } : null;
};

let db: Kysely<Database>;
let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
	db = await createTestDb();
	app = buildServer({ db, authenticate });
	baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
});

beforeEach(async () => {
	await emptyTestDb(db);
	await db.insertInto("orgs").values({ id: ORG, name: "Demo" }).execute();
});

afterAll(async () => {
	await app.close();
	await db.destroy();
});

const headers = {
	"x-protocol-version": PROTOCOL_VERSION,
	authorization: `Bearer ${PHONE}`,
};

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

describe("sync routes", () => {
	it("push and pull through HTTP", async () => {
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

	it("refuses an unsupported protocol version", async () => {
		const response = await app.inject({
			url: "/sync/pull?cursor=0",
			headers: { ...headers, "x-protocol-version": "0" },
		});
		expect(response.statusCode).toBe(426);
		expect(response.json()).toEqual({ error: "UNSUPPORTED_PROTOCOL" });
	});

	it("refuses a request without credentials", async () => {
		const response = await app.inject({
			url: "/sync/pull?cursor=0",
			headers: { "x-protocol-version": PROTOCOL_VERSION },
		});
		expect(response.statusCode).toBe(401);
	});

	it("refuses malformed input without leaking details", async () => {
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

	it("refuses a batch larger than 100 operations", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/sync/push",
			headers,
			payload: { ops: Array.from({ length: 101 }, () => op({ a: "1" })) },
		});
		expect(response.statusCode).toBe(400);
	});
});

describe("HttpTransport", () => {
	function device(deviceId: string) {
		const storage = new MemoryStorage();
		const client = new SyncClient({
			deviceId,
			clientVersion: "0.1.0",
			storage,
			transport: new HttpTransport({
				baseUrl,
				getToken: async () => deviceId,
			}),
		});
		return { client, storage };
	}

	it("syncs two devices through the real server", async () => {
		const phone = device(PHONE);
		const office = device(OFFICE);
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
