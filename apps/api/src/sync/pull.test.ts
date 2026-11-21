import { encode } from "@fieldsync/hlc";
import { EVERYONE, type Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WORK_ORDER_SCOPING } from "../auth/policy.ts";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { handleGetEntity } from "./entity.ts";
import { handlePull, MAX_PULL_LIMIT } from "./pull.ts";
import { type Auth, handlePush } from "./push.ts";
import { resetOrg } from "./reset.ts";
import type { Scoping } from "./scope.ts";
import { openRules } from "./testing.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const NOW = 1_000_000;

const phone: Auth = { orgId: ORG, deviceId: PHONE };

let db: Kysely<Database>;
let nextOp = 0;

beforeAll(async () => {
	db = await createTestDb();
});

beforeEach(async () => {
	await emptyTestDb(db);
	await db
		.insertInto("orgs")
		.values([
			{ id: ORG, name: "Demo" },
			{ id: OTHER_ORG, name: "Other" },
		])
		.execute();
});

afterAll(() => db.destroy());

function op(wall: number, patch: Op["patch"]): Op {
	nextOp += 1;
	const id = nextOp.toString(16).padStart(12, "0");
	return {
		opId: `00000000-0000-7000-8000-${id}`,
		deviceId: PHONE,
		entityType: "work_order",
		entityId: `00000000-0000-4000-8000-${id}`,
		kind: "upsert",
		patch,
		base: {},
		hlc: encode({ wall, counter: 0, node: PHONE.slice(0, 8) }),
		clientVersion: "0.1.0",
	};
}

async function seed(count: number, auth = phone): Promise<Op[]> {
	const ops = Array.from({ length: count }, (_, i) =>
		op(i + 1, { title: `Job ${i + 1}` }),
	);
	await handlePush(db, auth, { ops }, { ...openRules, now: () => NOW });
	return ops;
}

function pull(cursor: number, limit = 100, auth = phone) {
	return handlePull(db, auth, { cursor, limit }, { now: () => NOW });
}

describe("handlePull", () => {
	it("returns the changes after the cursor, in order", async () => {
		const [first, second] = await seed(2);
		expect(await pull(0)).toEqual({
			epoch: expect.any(String),
			changes: [
				{
					seq: 1,
					opId: first?.opId,
					deviceId: PHONE,
					entityType: "work_order",
					entityId: first?.entityId,
					kind: "upsert",
					patch: { title: "Job 1" },
					hlc: first?.hlc,
				},
				expect.objectContaining({ seq: 2, opId: second?.opId }),
			],
			nextCursor: 2,
			hasMore: false,
			serverTime: NOW,
		});
	});

	it("starts after the cursor", async () => {
		await seed(3);
		const { changes } = await pull(2);
		expect(changes.map((c) => c.seq)).toEqual([3]);
	});

	it("pages through a long log", async () => {
		await seed(5);
		const first = await pull(0, 2);
		expect(first).toMatchObject({ nextCursor: 2, hasMore: true });
		const second = await pull(first.nextCursor, 2);
		expect(second).toMatchObject({ nextCursor: 4, hasMore: true });
		const last = await pull(second.nextCursor, 2);
		expect(last).toMatchObject({ nextCursor: 5, hasMore: false });
	});

	it("keeps the cursor when there is nothing new", async () => {
		await seed(1);
		expect(await pull(1)).toMatchObject({
			changes: [],
			nextCursor: 1,
			hasMore: false,
		});
	});

	it("caps the page size", async () => {
		await seed(3);
		const { changes } = await pull(0, MAX_PULL_LIMIT + 1_000);
		expect(changes).toHaveLength(3);
		expect((await pull(0, 0)).changes).toHaveLength(1);
	});

	it("only returns changes of the caller's organisation", async () => {
		await seed(1, { orgId: OTHER_ORG, deviceId: PHONE });
		expect((await pull(0)).changes).toEqual([]);
	});
});

describe("resetOrg", () => {
	it("starts a new epoch with nothing to pull, and keeps numbering", async () => {
		await seed(2);
		const before = await pull(0);
		await resetOrg(db, ORG);

		const after = await pull(0);
		expect(after.epoch).not.toBe(before.epoch);
		expect(after.changes).toEqual([]);
		await seed(1);
		expect((await pull(0)).changes.map((c) => c.seq)).toEqual([3]);
	});

	it("leaves other orgs alone", async () => {
		await seed(1, { orgId: OTHER_ORG, deviceId: PHONE });
		const before = await pull(0, 100, { orgId: OTHER_ORG, deviceId: PHONE });
		await resetOrg(db, ORG);
		expect(await pull(0, 100, { orgId: OTHER_ORG, deviceId: PHONE })).toEqual(
			before,
		);
	});
});

describe("partial pull", () => {
	const ORDER = "00000000-0000-4000-8000-0000000000aa";
	let wall = 100;

	// The office edits one order; Junior's devices see it only while it is his.
	const edit = (patch: Op["patch"]) => {
		wall += 1;
		return handlePush(
			db,
			phone,
			{ ops: [{ ...op(wall, patch), entityId: ORDER }] },
			{ ...openRules, scoping: WORK_ORDER_SCOPING, now: () => NOW },
		);
	};
	const asJunior = (cursor: number) =>
		handlePull(
			db,
			phone,
			{ cursor, limit: 100 },
			{ now: () => NOW, audience: "junior" },
		);

	it("sends nothing of other people's orders, but moves the cursor past them", async () => {
		await edit({ title: "Fix pump", assigneeId: "merveille" });
		await edit({ notes: "Hers" });
		expect(await asJunior(0)).toMatchObject({
			changes: [],
			nextCursor: 2,
			hasMore: false,
		});
	});

	it("sends the whole record when an order becomes his", async () => {
		await edit({ title: "Fix pump" });
		await edit({ assigneeId: "junior" });
		await edit({ notes: "On my way" });
		const { changes } = await asJunior(0);
		expect(changes.map((c) => [c.seq, c.scope])).toEqual([
			[2, "enter"],
			[3, undefined],
		]);
		// The copy as it is now: the title he never received, and the later notes.
		expect(changes[0]?.state?.fields).toEqual({
			title: "Fix pump",
			assigneeId: "junior",
			notes: "On my way",
		});
	});

	it("tells his devices when an order is taken from him", async () => {
		await edit({ title: "Fix pump", assigneeId: "junior" });
		await edit({ assigneeId: "merveille" });
		await edit({ notes: "Hers" });
		const { changes, nextCursor } = await asJunior(0);
		expect(changes.map((c) => [c.seq, c.scope])).toEqual([
			[1, "enter"],
			[2, "leave"],
		]);
		expect(changes[1]?.state).toBeUndefined();
		expect(nextCursor).toBe(3);
	});

	it("gives each audience its own epoch, so a role change starts over", async () => {
		await edit({ title: "Fix pump" });
		const office = await pull(0);
		const junior = await asJunior(0);
		expect(junior.epoch).not.toBe(office.epoch);
		expect(junior.epoch.startsWith(office.epoch)).toBe(true);
	});
});

describe("records that belong to another", () => {
	const ORDER = "00000000-0000-4000-8000-0000000000aa";
	const PHOTO = "00000000-0000-4000-8000-0000000000bb";
	// Like a photo and its order: the photo shares the order's scope.
	const scoping: Scoping = {
		scopeOf: WORK_ORDER_SCOPING.scopeOf,
		parentOf: (type, _id, state) =>
			type === "photo" && typeof state.fields.orderId === "string"
				? { type: "work_order", id: state.fields.orderId }
				: null,
	};
	let wall = 200;

	const write = (type: string, id: string, patch: Op["patch"]) => {
		wall += 1;
		return handlePush(
			db,
			phone,
			{ ops: [{ ...op(wall, patch), entityType: type, entityId: id }] },
			{ ...openRules, scoping, now: () => NOW },
		);
	};
	const asJunior = (cursor: number) =>
		handlePull(db, phone, { cursor, limit: 100 }, { audience: "junior" });

	it("come with their parent, and go with it", async () => {
		await write("work_order", ORDER, { title: "Fix pump" });
		await write("photo", PHOTO, { orderId: ORDER, caption: "Before" });
		await write("work_order", ORDER, { assigneeId: "junior" });
		await write("photo", PHOTO, { caption: "After" });
		await write("work_order", ORDER, { assigneeId: "merveille" });

		const { changes } = await asJunior(0);
		expect(changes.map((c) => [c.seq, c.entityType, c.scope])).toEqual([
			[3, "work_order", "enter"],
			[4, "photo", undefined],
			[5, "work_order", "leave"],
		]);
		expect(changes[0]?.children).toEqual([
			{
				entityType: "photo",
				entityId: PHOTO,
				state: expect.objectContaining({
					fields: { orderId: ORDER, caption: "After" },
				}),
			},
		]);
		expect(changes[2]?.children).toEqual([
			{ entityType: "photo", entityId: PHOTO },
		]);
	});

	it("are only visible to whoever sees the parent", async () => {
		await write("work_order", ORDER, {
			title: "Fix pump",
			assigneeId: "junior",
		});
		await write("photo", PHOTO, { orderId: ORDER, caption: "Before" });
		const request = { entityType: "photo", entityId: PHOTO };
		const as = (audience: string) =>
			handleGetEntity(db, phone, request, { audience, scoping });
		expect((await as("junior")).entity).not.toBeNull();
		expect((await as("merveille")).entity).toBeNull();
	});
});

describe("records shared with everyone", () => {
	const ORDER = "00000000-0000-4000-8000-0000000000cc";
	const scoping: Scoping = {
		scopeOf: (_type, state) =>
			state.fields.assigneeId === "all"
				? EVERYONE
				: WORK_ORDER_SCOPING.scopeOf("work_order", state),
		parentOf: () => null,
	};
	let wall = 300;

	const edit = (patch: Op["patch"]) => {
		wall += 1;
		return handlePush(
			db,
			phone,
			{ ops: [{ ...op(wall, patch), entityId: ORDER }] },
			{ ...openRules, scoping, now: () => NOW },
		);
	};
	const as = (audience: string) =>
		handlePull(db, phone, { cursor: 0, limit: 100 }, { audience });

	it("reach every device, entering and leaving like their own", async () => {
		await edit({ title: "Site visit" });
		await edit({ assigneeId: "all" });
		await edit({ assigneeId: "junior" });
		await edit({ notes: "His now" });
		await edit({ assigneeId: "merveille" });

		const scopes = async (audience: string) =>
			(await as(audience)).changes.map((c) => [c.seq, c.scope]);
		expect(await scopes("junior")).toEqual([
			[2, "enter"],
			[3, undefined],
			[4, undefined],
			[5, "leave"],
		]);
		expect(await scopes("merveille")).toEqual([
			[2, "enter"],
			[3, "leave"],
			[5, "enter"],
		]);
	});

	it("are visible to any device", async () => {
		await edit({ title: "Site visit", assigneeId: "all" });
		const { entity } = await handleGetEntity(
			db,
			phone,
			{ entityType: "work_order", entityId: ORDER },
			{ audience: "junior", scoping },
		);
		expect(entity).not.toBeNull();
	});
});
