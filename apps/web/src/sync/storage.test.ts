import "fake-indexeddb/auto";
import { encode } from "@fieldsync/hlc";
import { describeStorage } from "@fieldsync/sync-client/contract";
import { expect, it } from "vitest";
import { DexieStorage, LocalDb } from "./storage.ts";

describeStorage(
	"IndexedDB",
	async () => new DexieStorage(new LocalDb(crypto.randomUUID())),
);

it("keeps the outbox and records after the app restarts", async () => {
	const name = crypto.randomUUID();
	const hlc = encode({ wall: 1, counter: 0, node: "0a1b2c3d" });
	const op = {
		opId: crypto.randomUUID(),
		deviceId: "0a1b2c3d-0000-4000-8000-000000000001",
		entityType: "work_order",
		entityId: crypto.randomUUID(),
		kind: "upsert" as const,
		patch: { status: "done" },
		base: {},
		hlc,
		clientVersion: "0.1.0",
	};
	const state = {
		fields: op.patch,
		clocks: { status: hlc },
		createdHlc: hlc,
		deletedHlc: null,
		restoredHlc: null,
	};

	const before = new LocalDb(name);
	await new DexieStorage(before).commitLocal(op, state);
	before.close();

	const after = new DexieStorage(new LocalDb(name));
	expect(await after.getEntity("work_order", op.entityId)).toEqual(state);
	expect(await after.getOutbox()).toEqual([{ op, status: "pending" }]);
});
