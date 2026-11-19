import { randomUUID } from "node:crypto";
import { decode, MAX_DRIFT_MS } from "@fieldsync/hlc";
import { type EntityState, merge } from "@fieldsync/merge";
import {
	type Op,
	type OpResult,
	OpSchema,
	type PushRequest,
	type PushResponse,
	type RejectReason,
} from "@fieldsync/protocol";
import { type Kysely, sql, type Transaction } from "kysely";
import type { Database } from "../db/schema.ts";

export type Auth = { orgId: string; deviceId: string };

export function handlePush(
	db: Kysely<Database>,
	auth: Auth,
	body: PushRequest,
	now: () => number = Date.now,
): Promise<PushResponse> {
	return db.transaction().execute(async (tx) => {
		// One writer per org at a time: change numbers are then handed out in
		// commit order, so a device pulling "everything after N" misses nothing.
		await tx
			.selectFrom("orgs")
			.select("id")
			.where("id", "=", auth.orgId)
			.forUpdate()
			.executeTakeFirstOrThrow();

		const results: OpResult[] = [];
		for (const raw of body.ops) {
			results.push(await pushOne(tx, auth, raw, now()));
		}
		return { results, serverTime: now() };
	});
}

async function pushOne(
	tx: Transaction<Database>,
	auth: Auth,
	raw: unknown,
	now: number,
): Promise<OpResult> {
	const parsed = OpSchema.safeParse(raw);
	if (!parsed.success) {
		return { opId: opIdOf(raw), status: "rejected", reason: "INVALID_OP" };
	}
	const op = parsed.data;

	const prior = await tx
		.selectFrom("received_ops")
		.select("result")
		.where("org_id", "=", auth.orgId)
		.where("op_id", "=", op.opId)
		.executeTakeFirst();
	if (prior) {
		return prior.result.status === "applied"
			? { ...prior.result, status: "duplicate" }
			: prior.result;
	}

	const denied = check(auth, op, now);
	if (denied) {
		const result: OpResult = {
			opId: op.opId,
			status: "rejected",
			reason: denied,
		};
		// A drift rejection depends on the time, so a later retry may succeed.
		if (denied !== "CLOCK_DRIFT") await remember(tx, auth, op, result);
		return result;
	}

	const { state, won, conflicts } = merge(await load(tx, auth, op), op);
	const seq = await nextSeq(tx, auth);
	await save(tx, auth, op, state, seq);
	await tx
		.insertInto("changes")
		.values({
			org_id: auth.orgId,
			seq,
			op_id: op.opId,
			device_id: op.deviceId,
			entity_type: op.entityType,
			entity_id: op.entityId,
			kind: op.kind,
			patch: JSON.stringify(won),
			hlc: op.hlc,
		})
		.execute();
	if (conflicts.length > 0) {
		await tx
			.insertInto("conflicts")
			.values(
				conflicts.map((c) => ({
					id: randomUUID(),
					org_id: auth.orgId,
					op_id: op.opId,
					entity_type: op.entityType,
					entity_id: op.entityId,
					field: c.field,
					reason: c.reason,
					winner: JSON.stringify(c.winner),
					loser: JSON.stringify(c.loser),
				})),
			)
			.execute();
	}

	const result: OpResult = {
		opId: op.opId,
		status: "applied",
		seq,
		conflicts,
	};
	await remember(tx, auth, op, result);
	return result;
}

function check(auth: Auth, op: Op, now: number): RejectReason | null {
	if (op.deviceId !== auth.deviceId) return "FORBIDDEN";
	if (decode(op.hlc).wall - now > MAX_DRIFT_MS) return "CLOCK_DRIFT";
	return null;
}

function opIdOf(raw: unknown): string | null {
	if (typeof raw !== "object" || raw === null) return null;
	const { opId } = raw as { opId?: unknown };
	return typeof opId === "string" ? opId : null;
}

async function load(
	tx: Transaction<Database>,
	auth: Auth,
	op: Op,
): Promise<EntityState | null> {
	const row = await tx
		.selectFrom("entities")
		.selectAll()
		.where("org_id", "=", auth.orgId)
		.where("type", "=", op.entityType)
		.where("id", "=", op.entityId)
		.executeTakeFirst();
	if (!row) return null;
	return {
		fields: row.fields,
		clocks: row.clocks,
		createdHlc: row.created_hlc,
		deletedHlc: row.deleted_hlc,
		restoredHlc: row.restored_hlc,
	};
}

async function save(
	tx: Transaction<Database>,
	auth: Auth,
	op: Op,
	state: EntityState,
	seq: number,
): Promise<void> {
	const values = {
		fields: JSON.stringify(state.fields),
		clocks: JSON.stringify(state.clocks),
		created_hlc: state.createdHlc,
		deleted_hlc: state.deletedHlc,
		restored_hlc: state.restoredHlc,
		updated_seq: seq,
	};
	await tx
		.insertInto("entities")
		.values({
			org_id: auth.orgId,
			type: op.entityType,
			id: op.entityId,
			...values,
		})
		.onConflict((oc) =>
			oc.columns(["org_id", "type", "id"]).doUpdateSet(values),
		)
		.execute();
}

async function nextSeq(tx: Transaction<Database>, auth: Auth): Promise<number> {
	const { seq } = await tx
		.updateTable("orgs")
		.set({ seq: sql`seq + 1` })
		.where("id", "=", auth.orgId)
		.returning("seq")
		.executeTakeFirstOrThrow();
	return Number(seq);
}

async function remember(
	tx: Transaction<Database>,
	auth: Auth,
	op: Op,
	result: OpResult,
): Promise<void> {
	await tx
		.insertInto("received_ops")
		.values({
			org_id: auth.orgId,
			op_id: op.opId,
			device_id: op.deviceId,
			result: JSON.stringify(result),
		})
		.execute();
}
