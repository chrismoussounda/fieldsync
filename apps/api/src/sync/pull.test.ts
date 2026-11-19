import { encode } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { handlePull, MAX_PULL_LIMIT } from "./pull.ts";
import { type Auth, handlePush } from "./push.ts";
import { allowAll } from "./testing.ts";

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
	await handlePush(db, auth, { ops }, { authorize: allowAll, now: () => NOW });
	return ops;
}

function pull(cursor: number, limit = 100, auth = phone) {
	return handlePull(db, auth, { cursor, limit }, () => NOW);
}

describe("handlePull", () => {
	it("returns the changes after the cursor, in order", async () => {
		const [first, second] = await seed(2);
		expect(await pull(0)).toEqual({
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
