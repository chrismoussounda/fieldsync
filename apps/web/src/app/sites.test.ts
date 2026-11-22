import "fake-indexeddb/auto";
import type { EntityState } from "@fieldsync/merge";
import { SITE, WORK_ORDER } from "@fieldsync/work-orders";
import { expect, it } from "vitest";
import { LocalDb } from "../sync/storage.ts";
import { jobsAt, openJobsBySite, sitesOf, telLink, toSite } from "./sites.ts";

const BAKERY = "00000000-0000-4000-8000-0000000000aa";
const CLINIC = "00000000-0000-4000-8000-0000000000bb";

it("lists the sites by name and each site's jobs, unfinished then latest", async () => {
	const db = new LocalDb(crypto.randomUUID());
	const put = (
		type: string,
		id: string,
		fields: Record<string, string>,
		deleted = false,
	) =>
		db.entities.put({
			type,
			id,
			state: {
				fields,
				clocks: {},
				createdHlc: "0000000000001-0000-0a1b2c3d",
				deletedHlc: deleted ? "0000000000002-0000-0a1b2c3d" : null,
				restoredHlc: null,
			},
		});
	await put(SITE, CLINIC, { name: "Clinique de Bacongo" });
	await put(SITE, BAKERY, {
		name: "Boulangerie La Paix",
		contactPhone: "+242",
	});
	await put(SITE, "gone", { name: "Closed shop" }, true);
	const job = (id: string, fields: Record<string, string>) =>
		put(WORK_ORDER, id, { siteId: BAKERY, title: id, ...fields });
	await job("old", { status: "done", dueDate: "2026-10-01" });
	await job("recent", { status: "done", dueDate: "2026-11-10" });
	await job("open", { status: "assigned", dueDate: "2026-09-01" });
	await put(WORK_ORDER, "elsewhere", { siteId: CLINIC, title: "elsewhere" });

	expect((await sitesOf(db)).map((s) => s.name)).toEqual([
		"Boulangerie La Paix",
		"Clinique de Bacongo",
	]);
	expect((await sitesOf(db))[0]?.contactPhone).toBe("+242");
	expect((await jobsAt(db, BAKERY)).map((o) => o.id)).toEqual([
		"open",
		"recent",
		"old",
	]);
	// Done and cancelled jobs do not count; other sites' jobs do not mix in.
	await job("cancelled", { status: "cancelled" });
	expect(await openJobsBySite(db)).toEqual(
		new Map([
			[BAKERY, 1],
			[CLINIC, 1],
		]),
	);
});

it("keeps a valid pin and drops a malformed one", () => {
	const site = (location?: EntityState["fields"][string]) =>
		toSite("s", {
			fields: {
				name: "Kiosk",
				...(location === undefined ? {} : { location }),
			},
			clocks: {},
			createdHlc: "0000000000001-0000-0a1b2c3d",
			deletedHlc: null,
			restoredHlc: null,
		})?.location;
	expect(site({ lat: -4.27, lng: 15.28 })).toEqual({ lat: -4.27, lng: 15.28 });
	expect(site()).toBeNull();
	expect(site({ lat: 120, lng: 0 })).toBeNull();
	expect(site("-4.27,15.28")).toBeNull();
});

it("dials a phone number as written", () => {
	expect(telLink("+242 06 (000) 00-09")).toBe("tel:+242060000009");
});
