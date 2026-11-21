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
import { readEntity } from "./records.ts";
import { type EntityRef, type Scoping, scopeWith } from "./scope.ts";

export type Auth = { orgId: string; deviceId: string };

/**
 * Whether the device's user may apply an operation to the record as it is
 * now; `parent` is the record it belongs to, if any, like a photo's order.
 */
export type Authorize = (
	op: Op,
	current: EntityState | null,
	parent: EntityState | null,
) => boolean;

/** Whether an operation's values make sense, whoever sends it. */
export type Validate = (op: Op) => boolean;

export type PushOptions = {
	authorize: Authorize;
	validate?: Validate;
	/**
	 * Recorded on each change, so partial pulls know who it concerns. Required:
	 * a writer that forgot it would hide its records from every technician.
	 */
	scoping: Scoping;
	now?: () => number;
};

type Rules = { authorize: Authorize; validate: Validate; scoping: Scoping };

export function handlePush(
	db: Kysely<Database>,
	auth: Auth,
	body: PushRequest,
	{ authorize, validate = () => true, scoping, now = Date.now }: PushOptions,
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
			results.push(
				await pushOne(tx, auth, { authorize, validate, scoping }, raw, now()),
			);
		}
		return { results, serverTime: now() };
	});
}

async function pushOne(
	tx: Transaction<Database>,
	auth: Auth,
	{ authorize, validate, scoping }: Rules,
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

	const { entityType: type, entityId: id } = op;
	const current = await readEntity(tx, auth.orgId, type, id);
	const { state, won, conflicts } = merge(current, op);
	const ref = scoping.parentOf(type, id, state);
	const parent = ref
		? await readEntity(tx, auth.orgId, ref.type, ref.id)
		: null;
	const denied =
		check(auth, op, now) ??
		(validate(op) ? null : "INVALID_OP") ??
		(authorize(op, current, parent) ? null : "FORBIDDEN");
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

	const seq = await nextSeq(tx, auth);
	await save(tx, auth, op, state, ref, seq);
	// A record only changes parent if its own fields say so.
	const refBefore = current ? scoping.parentOf(type, id, current) : null;
	const parentBefore =
		refBefore && (refBefore.type !== ref?.type || refBefore.id !== ref?.id)
			? await readEntity(tx, auth.orgId, refBefore.type, refBefore.id)
			: parent;
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
			scope_before: current
				? scopeWith(scoping, type, id, current, parentBefore)
				: null,
			scope_after: scopeWith(scoping, type, id, state, parent),
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

async function save(
	tx: Transaction<Database>,
	auth: Auth,
	op: Op,
	state: EntityState,
	parent: EntityRef | null,
	seq: number,
): Promise<void> {
	const values = {
		parent_type: parent?.type ?? null,
		parent_id: parent?.id ?? null,
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
