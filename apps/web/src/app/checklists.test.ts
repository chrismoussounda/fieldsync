import "fake-indexeddb/auto";
import { CHECKLIST_ITEM } from "@fieldsync/work-orders";
import { expect, it } from "vitest";
import { LocalDb } from "../sync/storage.ts";
import { itemsOf, progressByOrder } from "./checklists.ts";

const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";

it("lists an order's steps in order and counts them per order", async () => {
	const db = new LocalDb(crypto.randomUUID());
	const put = (id: string, fields: Record<string, unknown>, deleted = false) =>
		db.entities.put({
			type: CHECKLIST_ITEM,
			id,
			state: {
				fields: fields as Record<string, string>,
				clocks: {},
				createdHlc: "0000000000001-0000-0a1b2c3d",
				deletedHlc: deleted ? "0000000000002-0000-0a1b2c3d" : null,
				restoredHlc: null,
			},
		});
	await put("i2", { orderId: A, label: "Second", position: 2, done: true });
	await put("i1", { orderId: A, label: "First", position: 1 });
	await put("i3", { orderId: B, label: "Other", position: 1 });
	await put("i4", { orderId: A, label: "Removed", position: 3 }, true);

	expect((await itemsOf(db, A)).map((i) => i.label)).toEqual([
		"First",
		"Second",
	]);
	expect(progressByOrder(await itemsOf(db))).toEqual(
		new Map([
			[A, { done: 1, total: 2 }],
			[B, { done: 0, total: 1 }],
		]),
	);
});
