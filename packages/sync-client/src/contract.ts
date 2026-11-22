import { encode } from "@fieldsync/hlc";
import type { Change, EntityState, Op } from "@fieldsync/protocol";
import { describe, expect, it } from "vitest";
import type { SyncStorage } from "./storage.ts";

const DEVICE = "0a1b2c3d-0000-4000-8000-000000000001";
const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";

let ids = 0;

function op(
	entityId: string,
	wall: number,
	patch: Op["patch"],
	kind: Op["kind"] = "upsert",
): Op {
	ids += 1;
	return {
		opId: `00000000-0000-7000-8000-${ids.toString(16).padStart(12, "0")}`,
		deviceId: DEVICE,
		entityType: "work_order",
		entityId,
		kind,
		patch,
		base: {},
		hlc: encode({ wall, counter: 0, node: "0a1b2c3d" }),
		clientVersion: "0.1.0",
	};
}

function stateOf(o: Op): EntityState {
	return {
		fields: o.patch,
		clocks: Object.fromEntries(Object.keys(o.patch).map((f) => [f, o.hlc])),
		createdHlc: o.hlc,
		deletedHlc: null,
		restoredHlc: null,
	};
}

function change(o: Op, seq: number): Change {
	const { base: _base, clientVersion: _version, ...rest } = o;
	return { ...rest, seq };
}

async function queue(storage: SyncStorage, ...ops: Op[]): Promise<void> {
	for (const o of ops) await storage.commitLocal(o, stateOf(o));
}

/** The behaviour every `SyncStorage` must share, run against a fresh store. */
export function describeStorage(
	name: string,
	create: () => Promise<SyncStorage>,
): void {
	describe(`${name} storage`, () => {
		it("starts empty", async () => {
			const storage = await create();
			expect(await storage.getEntity("work_order", A)).toBeNull();
			expect(await storage.getCursor()).toBe(0);
			expect(await storage.getEpoch()).toBeNull();
			expect(await storage.getOutbox()).toEqual([]);
		});

		it("saves a local change and queues it", async () => {
			const storage = await create();
			const o = op(A, 1, { status: "assigned" });
			await queue(storage, o);
			expect(await storage.getEntity("work_order", A)).toEqual(stateOf(o));
			expect(await storage.getOutbox()).toEqual([{ op: o, status: "pending" }]);
		});

		it("claims pending operations oldest first, each once", async () => {
			const storage = await create();
			const ops = [1, 2, 3].map((w) => op(A, w, { n: w }));
			await queue(storage, ...ops);
			expect(await storage.claimPending(2)).toEqual(ops.slice(0, 2));
			expect(await storage.claimPending(2)).toEqual(ops.slice(2));
			expect(await storage.claimPending(2)).toEqual([]);
		});

		it("puts released operations back in their place", async () => {
			const storage = await create();
			const ops = [1, 2].map((w) => op(A, w, { n: w }));
			await queue(storage, ...ops);
			await storage.claimPending(1);
			await storage.releaseOps([ops[0]?.opId ?? ""]);
			expect(await storage.claimPending(2)).toEqual(ops);
		});

		it("drops accepted operations and keeps rejected ones as dead", async () => {
			const storage = await create();
			const [applied, rejected] = [op(A, 1, { n: 1 }), op(A, 2, { n: 2 })];
			await queue(storage, applied, rejected);
			await storage.claimPending(2);
			await storage.resolveOps([
				{ opId: applied.opId, status: "applied", seq: 1, conflicts: [] },
				{ opId: rejected.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			expect(await storage.getOutbox()).toEqual([
				{ op: rejected, status: "dead", reason: "FORBIDDEN" },
			]);
			expect(await storage.claimPending(10)).toEqual([]);
		});

		it("merges pulled changes and moves the cursor", async () => {
			const storage = await create();
			const local = op(A, 1, { status: "assigned", notes: "local" });
			await queue(storage, local);
			const remote = op(A, 2, { status: "done" });
			await storage.applyRemote([change(remote, 7)], 7, "e1");
			expect((await storage.getEntity("work_order", A))?.fields).toEqual({
				status: "done",
				notes: "local",
			});
			expect(await storage.getCursor()).toBe(7);
			expect(await storage.getEpoch()).toBe("e1");
		});

		it("takes the server's copy of a record entering the device", async () => {
			const storage = await create();
			const mine = op(A, 5, { notes: "mine" });
			await queue(storage, mine);
			const server = stateOf(op(A, 3, { title: "Pump", status: "assigned" }));
			const entering = op(A, 4, { assigneeId: "me" });
			await storage.applyRemote(
				[{ ...change(entering, 9), scope: "enter", state: server }],
				9,
				"e1",
			);
			// The copy plus this device's edit still on its way.
			expect((await storage.getEntity("work_order", A))?.fields).toEqual({
				title: "Pump",
				status: "assigned",
				notes: "mine",
			});
		});

		it("drops a record leaving the device, keeping only unsent edits", async () => {
			const storage = await create();
			await storage.applyRemote(
				[change(op(A, 1, { title: "Pump" }), 1), change(op(B, 2, { n: 1 }), 2)],
				2,
				"e1",
			);
			const mine = op(B, 3, { notes: "mine" });
			await queue(storage, mine);
			const leave = (o: Op, seq: number): Change => ({
				...change(o, seq),
				scope: "leave",
			});
			await storage.applyRemote(
				[leave(op(A, 4, { assigneeId: "x" }), 3), leave(op(B, 5, {}), 4)],
				4,
				"e1",
			);
			expect(await storage.getEntity("work_order", A)).toBeNull();
			expect((await storage.getEntity("work_order", B))?.fields).toEqual({
				notes: "mine",
			});
			expect(await storage.getCursor()).toBe(4);
		});

		it("takes and drops the records that belong to one, with it", async () => {
			const storage = await create();
			const photo = stateOf(op(B, 2, { orderId: A, caption: "Pump" }));
			const assign = op(A, 3, { assigneeId: "me" });
			await storage.applyRemote(
				[
					{
						...change(assign, 5),
						scope: "enter",
						state: stateOf(assign),
						children: [{ entityType: "photo", entityId: B, state: photo }],
					},
				],
				5,
				"e1",
			);
			expect(await storage.getEntity("photo", B)).toEqual(photo);

			await storage.applyRemote(
				[
					{
						...change(op(A, 4, { assigneeId: "x" }), 6),
						scope: "leave",
						children: [{ entityType: "photo", entityId: B }],
					},
				],
				6,
				"e1",
			);
			expect(await storage.getEntity("work_order", A)).toBeNull();
			expect(await storage.getEntity("photo", B)).toBeNull();
		});

		it("forgets what was pulled after a server reset, but not queued changes", async () => {
			const storage = await create();
			const mine = op(A, 1, { notes: "mine" });
			await queue(storage, mine);
			await storage.applyRemote(
				[change(op(B, 2, { title: "theirs" }), 3)],
				3,
				"e1",
			);
			await storage.resetRemote();
			expect(await storage.getEntity("work_order", A)).toEqual(stateOf(mine));
			expect(await storage.getEntity("work_order", B)).toBeNull();
			expect(await storage.getCursor()).toBe(0);
			expect(await storage.getEpoch()).toBeNull();
			expect(await storage.getOutbox()).toEqual([
				{ op: mine, status: "pending" },
			]);
		});

		it("rewrites operations in place and leaves dead ones alone", async () => {
			const storage = await create();
			const [keep, stale, dead] = [1, 2, 3].map((w) => op(A, w, { n: w }));
			if (!keep || !stale || !dead) throw new Error("unreachable");
			await queue(storage, keep, stale, dead);
			await storage.claimPending(3);
			await storage.resolveOps([
				{ opId: dead.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			const renewed = { ...stale, opId: op(A, 0, {}).opId };
			const changed = await storage.rewriteOps((o) =>
				o.opId === stale.opId || o.opId === dead.opId ? renewed : null,
			);
			expect(changed).toEqual([renewed]);
			expect(await storage.getOutbox()).toEqual([
				{ op: keep, status: "inflight" },
				{ op: renewed, status: "pending" },
				{ op: dead, status: "dead", reason: "FORBIDDEN" },
			]);
		});

		it("puts back operations left inflight, and only those", async () => {
			const storage = await create();
			const [sent, queued, refused] = [1, 2, 3].map((w) => op(A, w, { n: w }));
			if (!sent || !queued || !refused) throw new Error("unreachable");
			await queue(storage, sent, refused);
			await storage.claimPending(2);
			await storage.resolveOps([
				{ opId: refused.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			await queue(storage, queued);
			await storage.releaseInflight();
			expect(await storage.getOutbox()).toEqual([
				{ op: sent, status: "pending" },
				{ op: refused, status: "dead", reason: "FORBIDDEN" },
				{ op: queued, status: "pending" },
			]);
		});

		it("discards rejected operations only", async () => {
			const storage = await create();
			const [kept, refused] = [op(A, 1, { n: 1 }), op(A, 2, { n: 2 })];
			await queue(storage, kept, refused);
			await storage.claimPending(2);
			await storage.resolveOps([
				{ opId: refused.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			await storage.discardDead([kept.opId, refused.opId]);
			expect(await storage.getOutbox()).toEqual([
				{ op: kept, status: "inflight" },
			]);
		});

		it("rebuilds a record from the server copy and its queued operations", async () => {
			const storage = await create();
			const queued = op(A, 5, { notes: "mine" });
			const refused = op(A, 6, { status: "done" });
			await queue(storage, queued, refused, op(B, 7, { other: 1 }));
			await storage.claimPending(10);
			await storage.resolveOps([
				{ opId: refused.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			const server = stateOf(op(A, 3, { status: "assigned" }));
			await storage.rebuildEntity("work_order", A, server);
			expect((await storage.getEntity("work_order", A))?.fields).toEqual({
				status: "assigned",
				notes: "mine",
			});
		});

		it("removes a record the server never had and nothing recreates", async () => {
			const storage = await create();
			const refused = op(A, 1, { title: "x" });
			await queue(storage, refused);
			await storage.claimPending(1);
			await storage.resolveOps([
				{ opId: refused.opId, status: "rejected", reason: "FORBIDDEN" },
			]);
			await storage.rebuildEntity("work_order", A, null);
			expect(await storage.getEntity("work_order", A)).toBeNull();
		});
	});
}
