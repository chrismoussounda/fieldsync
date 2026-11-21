import "fake-indexeddb/auto";
import {
	CHECKLIST_ITEM,
	PART,
	PHOTO,
	SITE,
	TIME_ENTRY,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { expect, it } from "vitest";
import { LocalDb } from "../sync/storage.ts";
import { reportOf } from "./report.ts";

const ORDER = "00000000-0000-4000-8000-0000000000aa";
const SITE_ID = "00000000-0000-4000-8000-0000000000bb";

it("gathers the order, its site, steps, time, parts, photos and signature", async () => {
	const db = new LocalDb(crypto.randomUUID());
	const put = (type: string, id: string, fields: Record<string, unknown>) =>
		db.entities.put({
			type,
			id,
			state: {
				fields: fields as Record<string, string>,
				clocks: {},
				createdHlc: "0000000000001-0000-0a1b2c3d",
				deletedHlc: null,
				restoredHlc: null,
			},
		});
	await put(WORK_ORDER, ORDER, { title: "Fix pump", siteId: SITE_ID });
	await put(SITE, SITE_ID, { name: "Boulangerie La Paix" });
	await put(CHECKLIST_ITEM, "i1", {
		orderId: ORDER,
		label: "Valve",
		position: 1,
	});
	await put(TIME_ENTRY, "t1", {
		orderId: ORDER,
		technicianId: "junior",
		startedAt: "2026-11-21T08:00:00.000Z",
		endedAt: "2026-11-21T09:30:00.000Z",
	});
	await put(TIME_ENTRY, "t2", {
		orderId: ORDER,
		technicianId: "junior",
		startedAt: "2026-11-21T11:00:00.000Z",
		endedAt: null,
	});
	await put(PART, "pa1", {
		orderId: ORDER,
		name: "Seal",
		quantity: 2,
		addedBy: "junior",
		addedAt: "2026-11-21T08:30:00.000Z",
	});
	const photo = (id: string, takenAt: string, signer?: string) =>
		put(PHOTO, id, { orderId: ORDER, takenAt, ...(signer ? { signer } : {}) });
	await photo("p1", "2026-11-21T08:10:00.000Z");
	await photo("s1", "2026-11-21T09:20:00.000Z", "Mme Okemba");
	await photo("s2", "2026-11-21T09:25:00.000Z", "M. Okemba");

	const report = await reportOf(
		db,
		ORDER,
		Date.parse("2026-11-21T11:15:00.000Z"),
	);
	expect(report?.order.title).toBe("Fix pump");
	expect(report?.site?.name).toBe("Boulangerie La Paix");
	expect(report?.items.map((i) => i.label)).toEqual(["Valve"]);
	expect(report?.minutes).toBe(105);
	expect(report?.parts.map((p) => p.name)).toEqual(["Seal"]);
	expect(report?.photos.map((p) => p.id)).toEqual(["p1"]);
	expect(report?.signature?.signer).toBe("M. Okemba");
	expect(await reportOf(db, "missing", 0)).toBeNull();
});
