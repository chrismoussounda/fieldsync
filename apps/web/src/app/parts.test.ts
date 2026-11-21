import "fake-indexeddb/auto";
import { PART } from "@fieldsync/work-orders";
import { expect, it } from "vitest";
import { LocalDb } from "../sync/storage.ts";
import { formatQuantity, partNames, partsOf } from "./parts.ts";

const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";

it("lists an order's parts as added and suggests the names used most", async () => {
	const db = new LocalDb(crypto.randomUUID());
	const put = (
		id: string,
		orderId: string,
		name: string,
		addedAt: string,
		deleted = false,
	) =>
		db.entities.put({
			type: PART,
			id,
			state: {
				fields: { orderId, name, quantity: 1, addedBy: "junior", addedAt },
				clocks: {},
				createdHlc: "0000000000001-0000-0a1b2c3d",
				deletedHlc: deleted ? "0000000000002-0000-0a1b2c3d" : null,
				restoredHlc: null,
			},
		});
	await put("p2", A, "Pipe", "2026-11-21T10:00:00.000Z");
	await put("p1", A, "Seal", "2026-11-21T09:00:00.000Z");
	await put("p3", B, "Seal", "2026-11-20T09:00:00.000Z");
	await put("p4", A, "Wrong one", "2026-11-21T11:00:00.000Z", true);

	expect((await partsOf(db, A)).map((p) => p.name)).toEqual(["Seal", "Pipe"]);
	expect(partNames(await partsOf(db))).toEqual(["Seal", "Pipe"]);
});

it("shows a quantity with its unit", () => {
	expect(formatQuantity({ quantity: 1.5, unit: "m" })).toBe("1.5 m");
	expect(formatQuantity({ quantity: 3, unit: null })).toBe("3");
});
