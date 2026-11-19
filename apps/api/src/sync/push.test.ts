import { encode, MAX_DRIFT_MS } from "@fieldsync/hlc";
import type { Op } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/schema.ts";
import { createTestDb, emptyTestDb } from "../db/testing.ts";
import { type Auth, handlePush } from "./push.ts";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const PHONE = "0a1b2c3d-0000-4000-8000-000000000001";
const OFFICE = "ffffffff-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-0000000000aa";
const NOW = 1_000_000;

const phone: Auth = { orgId: ORG, deviceId: PHONE };
const office: Auth = { orgId: ORG, deviceId: OFFICE };

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

function op(deviceId: string, wall: number, overrides: Partial<Op> = {}): Op {
	nextOp += 1;
	return {
		opId: `00000000-0000-7000-8000-${nextOp.toString(16).padStart(12, "0")}`,
		deviceId,
		entityType: "work_order",
		entityId: ORDER,
		kind: "upsert",
		patch: {},
		base: {},
		hlc: encode({ wall, counter: 0, node: deviceId.slice(0, 8) }),
		clientVersion: "0.1.0",
		...overrides,
	};
}

function push(auth: Auth, ...ops: unknown[]) {
	return handlePush(db, auth, { ops }, () => NOW);
}

function order(orgId = ORG) {
	return db
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("id", "=", ORDER)
		.executeTakeFirst();
}

async function changes() {
	const rows = await db
		.selectFrom("changes")
		.select(["seq", "op_id", "kind", "patch"])
		.where("org_id", "=", ORG)
		.orderBy("seq")
		.execute();
	return rows.map((row) => ({ ...row, seq: Number(row.seq) }));
}

describe("handlePush", () => {
	it("applies an operation and logs the change", async () => {
		const create = op(PHONE, 1, { patch: { status: "assigned" } });
		const response = await push(phone, create);

		expect(response).toEqual({
			results: [
				{ opId: create.opId, status: "applied", seq: 1, conflicts: [] },
			],
			serverTime: NOW,
		});
		expect(await order()).toMatchObject({
			fields: { status: "assigned" },
			clocks: { status: create.hlc },
		});
		expect(await changes()).toEqual([
			{
				seq: 1,
				op_id: create.opId,
				kind: "upsert",
				patch: { status: "assigned" },
			},
		]);
	});

	it("numbers changes in order across batches", async () => {
		await push(
			phone,
			op(PHONE, 1, { patch: { a: 1 } }),
			op(PHONE, 2, { patch: { b: 2 } }),
		);
		await push(office, op(OFFICE, 3, { patch: { c: 3 } }));
		expect((await changes()).map((c) => c.seq)).toEqual([1, 2, 3]);
	});

	it("keeps edits to different fields from two devices", async () => {
		await push(
			phone,
			op(PHONE, 1, { patch: { status: "assigned", priority: "normal" } }),
		);
		await push(office, op(OFFICE, 3, { patch: { priority: "urgent" } }));
		await push(phone, op(PHONE, 2, { patch: { status: "in_progress" } }));
		expect((await order())?.fields).toEqual({
			status: "in_progress",
			priority: "urgent",
		});
	});

	it("logs only the fields an operation won", async () => {
		await push(office, op(OFFICE, 5, { patch: { status: "cancelled" } }));
		await push(
			phone,
			op(PHONE, 2, { patch: { status: "completed", notes: "done" } }),
		);
		expect((await changes())[1]?.patch).toEqual({ notes: "done" });
	});

	it("answers a retry without applying it twice", async () => {
		const create = op(PHONE, 1, { patch: { status: "assigned" } });
		await push(phone, create);
		const retry = await push(phone, create);

		expect(retry.results).toEqual([
			{ opId: create.opId, status: "duplicate", seq: 1, conflicts: [] },
		]);
		expect(await changes()).toHaveLength(1);
	});

	it("rejects a malformed operation and applies the rest", async () => {
		const good = op(PHONE, 1, { patch: { status: "assigned" } });
		const { results } = await push(
			phone,
			{ opId: "broken", kind: "rename" },
			good,
		);
		expect(results).toEqual([
			{ opId: "broken", status: "rejected", reason: "INVALID_OP" },
			{ opId: good.opId, status: "applied", seq: 1, conflicts: [] },
		]);
	});

	it("rejects an operation signed by another device", async () => {
		const forged = op(OFFICE, 1, { patch: { status: "cancelled" } });
		const { results } = await push(phone, forged);
		expect(results).toEqual([
			{ opId: forged.opId, status: "rejected", reason: "FORBIDDEN" },
		]);
		expect(await order()).toBeUndefined();
	});

	it("rejects a clock too far ahead, and accepts the retry once time catches up", async () => {
		const early = op(PHONE, NOW + MAX_DRIFT_MS + 1, { patch: { a: 1 } });
		const first = await push(phone, early);
		expect(first.results).toEqual([
			{ opId: early.opId, status: "rejected", reason: "CLOCK_DRIFT" },
		]);

		const later = await handlePush(db, phone, { ops: [early] }, () => NOW + 1);
		expect(later.results[0]?.status).toBe("applied");
	});

	it("records a conflict and returns it to the device", async () => {
		const create = op(PHONE, 1, { patch: { status: "assigned" } });
		const seen = { status: create.hlc };
		const cancel = op(OFFICE, 2, {
			patch: { status: "cancelled" },
			base: seen,
		});
		const complete = op(PHONE, 3, {
			patch: { status: "completed" },
			base: seen,
		});
		await push(phone, create);
		await push(office, cancel);
		const { results } = await push(phone, complete);

		const conflict = {
			opId: complete.opId,
			field: "status",
			reason: "concurrent_edit",
			winner: { value: "completed", hlc: complete.hlc },
			loser: { value: "cancelled", hlc: cancel.hlc },
		};
		expect(results[0]).toMatchObject({ conflicts: [conflict] });
		const stored = await db
			.selectFrom("conflicts")
			.select(["op_id", "field", "reason", "winner", "loser"])
			.execute();
		expect(stored).toEqual([
			{
				op_id: complete.opId,
				field: "status",
				reason: "concurrent_edit",
				winner: conflict.winner,
				loser: conflict.loser,
			},
		]);
	});

	it("keeps organisations apart", async () => {
		await push(phone, op(PHONE, 1, { patch: { status: "assigned" } }));
		await push(
			{ orgId: OTHER_ORG, deviceId: PHONE },
			op(PHONE, 2, { patch: { status: "cancelled" } }),
		);
		expect((await order(ORG))?.fields).toEqual({ status: "assigned" });
		expect((await order(OTHER_ORG))?.fields).toEqual({ status: "cancelled" });
	});

	it("applies nothing when the batch fails", async () => {
		const create = op(PHONE, 1, { patch: { status: "assigned" } });
		await expect(
			handlePush(db, { orgId: ORDER, deviceId: PHONE }, { ops: [create] }),
		).rejects.toThrow();
		expect(await changes()).toEqual([]);
	});
});
