import "fake-indexeddb/auto";
import { HttpError } from "@fieldsync/sync-client";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "../sync/storage.ts";
import { Session } from "./session.ts";

const USER = { id: "u1", name: "Junior", role: "technician" };

type Reply = { status: number; body: unknown } | "network";

/** Answers each request with the next reply, and records what was sent. */
function fakeFetch(...replies: Reply[]) {
	const sent: { url: string; body: Record<string, unknown> }[] = [];
	const fetch = (async (url: string, init?: RequestInit) => {
		sent.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
		const reply = replies.shift();
		if (!reply || reply === "network") throw new TypeError("Failed to fetch");
		return new Response(JSON.stringify(reply.body), { status: reply.status });
	}) as typeof globalThis.fetch;
	return { fetch, sent };
}

function tokens(n: number) {
	return {
		status: 200,
		body: {
			accessToken: `access-${n}`,
			refreshToken: `refresh-${n}`,
			expiresIn: 900,
			user: USER,
		},
	};
}

let db: LocalDb;
let time: number;

beforeEach(() => {
	db = new LocalDb(crypto.randomUUID());
	time = 0;
});

function session(fetch: typeof globalThis.fetch) {
	return new Session({ db, baseUrl: "/api", fetch, now: () => time });
}

describe("Session", () => {
	it("keeps one device id for the browser", async () => {
		const first = await session(fakeFetch().fetch).deviceId();
		expect(await session(fakeFetch().fetch).deviceId()).toBe(first);
	});

	it("signs in with the device id and remembers the user", async () => {
		const { fetch, sent } = fakeFetch(tokens(1));
		const auth = session(fetch);
		expect(await auth.login("junior@fieldsync.demo", "pw")).toEqual(USER);
		expect(sent[0]?.url).toBe("/api/auth/login");
		expect(sent[0]?.body.deviceId).toBe(await auth.deviceId());
		expect(await auth.getToken()).toBe("access-1");

		const reopened = session(fakeFetch().fetch);
		await reopened.load();
		expect(reopened.user).toEqual(USER);
	});

	it("starts over as a new device when the id is taken", async () => {
		const { fetch, sent } = fakeFetch(
			{ status: 409, body: { error: "DEVICE_TAKEN" } },
			tokens(1),
		);
		const auth = session(fetch);
		await db.setMeta("cursor", 42);
		await auth.login("a@b.c", "pw");
		expect(sent[1]?.body.deviceId).not.toBe(sent[0]?.body.deviceId);
		expect(await auth.deviceId()).toBe(sent[1]?.body.deviceId);
		expect(await db.getMeta("cursor")).toBeUndefined();
	});

	it("keeps the device id while changes wait to be sent", async () => {
		const auth = session(
			fakeFetch({ status: 409, body: { error: "DEVICE_TAKEN" } }).fetch,
		);
		await db.outbox.add({
			opId: "o1",
			entityType: "work_order",
			entityId: "e1",
			op: {} as never,
			status: "pending",
		});
		await expect(auth.login("a@b.c", "pw")).rejects.toEqual(
			new HttpError(409, "DEVICE_TAKEN"),
		);
	});

	it("reports a refused sign-in with its code", async () => {
		const auth = session(
			fakeFetch({ status: 401, body: { error: "UNAUTHORIZED" } }).fetch,
		);
		await expect(auth.login("a@b.c", "wrong")).rejects.toEqual(
			new HttpError(401, "UNAUTHORIZED"),
		);
		expect(auth.user).toBeNull();
	});

	it("refreshes shortly before the access token expires", async () => {
		const { fetch, sent } = fakeFetch(tokens(1), tokens(2));
		const auth = session(fetch);
		await auth.login("a@b.c", "pw");
		time += 800_000;
		expect(await auth.getToken()).toBe("access-1");
		time += 80_000;
		expect(await auth.getToken()).toBe("access-2");
		expect(sent[1]?.body).toEqual({ refreshToken: "refresh-1" });
	});

	it("shares one refresh between concurrent requests", async () => {
		const { fetch, sent } = fakeFetch(tokens(1), tokens(2));
		const auth = session(fetch);
		await auth.login("a@b.c", "pw");
		time += 900_000;
		const [a, b] = await Promise.all([auth.getToken(), auth.getToken()]);
		expect([a, b]).toEqual(["access-2", "access-2"]);
		expect(sent).toHaveLength(2);
	});

	it("restores a session after a restart by refreshing", async () => {
		await session(fakeFetch(tokens(1)).fetch).login("a@b.c", "pw");
		const { fetch, sent } = fakeFetch(tokens(2));
		const reopened = session(fetch);
		await reopened.load();
		expect(await reopened.getToken()).toBe("access-2");
		expect(sent[0]?.body).toEqual({ refreshToken: "refresh-1" });
	});

	it("stays signed in while offline", async () => {
		const auth = session(fakeFetch(tokens(1), "network").fetch);
		await auth.login("a@b.c", "pw");
		time += 900_000;
		await expect(auth.getToken()).rejects.toThrow(TypeError);
		expect(auth.user).toEqual(USER);
	});

	it("signs out when the server refuses the refresh", async () => {
		const auth = session(
			fakeFetch(tokens(1), { status: 401, body: { error: "UNAUTHORIZED" } })
				.fetch,
		);
		await auth.login("a@b.c", "pw");
		time += 900_000;
		await expect(auth.getToken()).rejects.toBeInstanceOf(HttpError);
		expect(auth.user).toBeNull();
		expect(await auth.getToken()).toBeNull();
	});

	it("marks the device revoked", async () => {
		const auth = session(
			fakeFetch(tokens(1), { status: 401, body: { error: "DEVICE_REVOKED" } })
				.fetch,
		);
		await auth.login("a@b.c", "pw");
		time += 900_000;
		await expect(auth.getToken()).rejects.toBeInstanceOf(HttpError);
		expect(auth.revoked).toBe(true);
	});

	it("locks out at once when a request says the device is revoked", async () => {
		const auth = session(fakeFetch(tokens(1)).fetch);
		await auth.login("a@b.c", "pw");
		await auth.reportFailure(new HttpError(401, "DEVICE_REVOKED"));
		expect(auth.revoked).toBe(true);
	});

	it("refreshes after a request refuses the access token", async () => {
		const { fetch, sent } = fakeFetch(tokens(1), tokens(2));
		const auth = session(fetch);
		await auth.login("a@b.c", "pw");
		await auth.reportFailure(new HttpError(401, "UNAUTHORIZED"));
		expect(await auth.getToken()).toBe("access-2");
		expect(sent[1]?.url).toBe("/api/auth/refresh");
	});

	it("notifies listeners when the user changes", async () => {
		const auth = session(fakeFetch(tokens(1)).fetch);
		let calls = 0;
		auth.subscribe(() => {
			calls += 1;
		});
		await auth.login("a@b.c", "pw");
		expect(calls).toBe(1);
	});
});

describe("Session in the demo", () => {
	const EXPIRES = new Date(1_000_000).toISOString();
	const demoTokens = (key: string, person: string, userId = person) => ({
		status: 201,
		body: {
			...tokens(1).body,
			user: { ...USER, id: userId },
			demo: { key, person, expiresAt: EXPIRES },
		},
	});
	const left = async () => {
		await db.setMeta("cursor", 7);
		await db.files.put({
			id: "f1",
			type: "image/jpeg",
			bytes: new ArrayBuffer(1),
			uploaded: 1,
		});
	};

	it("starts a demo, remembers it, and keeps it through a refresh", async () => {
		const { fetch, sent } = fakeFetch(demoTokens("k", "junior"), tokens(2));
		const auth = session(fetch);
		await auth.startDemo("junior");
		expect(sent[0]?.url).toBe("/api/demo/workspaces");
		expect(sent[0]?.body).toMatchObject({ person: "junior" });
		time += 900_000;
		await auth.getToken();

		const reopened = session(fakeFetch().fetch);
		await reopened.load();
		expect(reopened.snapshot().demo).toEqual({
			entry: { key: "k", person: "junior" },
			expiresAt: EXPIRES,
		});
	});

	it("becomes someone else with nothing left of the first, as the same device when coming back", async () => {
		const { fetch, sent } = fakeFetch(
			demoTokens("k", "dispatch"),
			demoTokens("k", "junior"),
			demoTokens("k", "dispatch"),
		);
		const auth = session(fetch);
		await auth.startDemo("dispatch");
		await left();
		await auth.joinDemo("k", "junior");
		expect(sent[1]?.body).toMatchObject({ key: "k", person: "junior" });
		expect(await db.getMeta("cursor")).toBeUndefined();
		expect(await db.files.count()).toBe(0);
		expect(auth.user?.id).toBe("junior");

		await auth.joinDemo("k", "dispatch");
		const [first, second, third] = sent.map((s) => s.body.deviceId);
		expect(second).not.toBe(first);
		expect(third).toBe(first);
		expect(await auth.deviceId()).toBe(first);
	});

	it("comes back as a new device once locked out", async () => {
		const { fetch, sent } = fakeFetch(
			demoTokens("k", "junior"),
			demoTokens("k", "admin"),
			{ status: 401, body: { error: "DEVICE_REVOKED" } },
			demoTokens("k", "junior"),
		);
		const auth = session(fetch);
		await auth.startDemo("junior");
		await auth.joinDemo("k", "admin");
		await auth.joinDemo("k", "junior");
		expect(sent[2]?.body.deviceId).toBe(sent[0]?.body.deviceId);
		expect(sent[3]?.body.deviceId).not.toBe(sent[0]?.body.deviceId);
		expect(auth.user?.id).toBe("junior");
	});

	it("knows the demo of someone who signed in to it by email", async () => {
		const reply = {
			status: 200,
			body: { ...tokens(1).body, demo: { expiresAt: EXPIRES } },
		};
		const auth = session(fakeFetch(reply).fetch);
		await auth.login("new@fieldsync.demo", "pw");
		expect(auth.snapshot().demo).toEqual({ entry: null, expiresAt: EXPIRES });
	});

	it("changes nothing when it cannot get in", async () => {
		const { fetch } = fakeFetch(demoTokens("k", "junior"), "network", {
			status: 403,
			body: { error: "ACCOUNT_DISABLED" },
		});
		const auth = session(fetch);
		await auth.startDemo("junior");
		await left();
		await expect(auth.joinDemo("k", "admin")).rejects.toThrow();
		await expect(auth.joinDemo("k", "admin")).rejects.toThrow();
		expect(auth.user?.id).toBe("junior");
		expect(await db.getMeta("cursor")).toBe(7);
	});

	it("never replaces changes left by a real account", async () => {
		const { fetch, sent } = fakeFetch(demoTokens("k", "junior"));
		await db.outbox.add({
			opId: "op",
			entityType: "work_order",
			entityId: "o1",
			op: {} as never,
			status: "pending",
		});
		await expect(session(fetch).startDemo("junior")).rejects.toMatchObject({
			code: "DEVICE_TAKEN",
		});
		expect(sent).toHaveLength(0);
		expect(await db.outbox.count()).toBe(1);
	});

	it("says so and erases everything when the demo is over", async () => {
		const gone = { status: 401, body: { error: "UNAUTHORIZED" } };
		const auth = session(fakeFetch(demoTokens("k", "junior"), gone).fetch);
		await auth.startDemo("junior");
		await left();
		time = 1_000_000;
		await expect(auth.getToken()).rejects.toBeInstanceOf(HttpError);
		expect(auth.snapshot()).toMatchObject({ user: null, demoEnded: true });
		expect(await db.files.count()).toBe(0);
		expect(await db.meta.count()).toBe(0);
	});
});
