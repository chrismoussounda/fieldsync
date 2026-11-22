import type { Op } from "@fieldsync/protocol";
import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { en } from "../i18n/en.ts";
import { changeText, type Fields, reasonOf } from "./changes.ts";

const ORDER = "00000000-0000-4000-8000-000000000001";
const ITEM = "00000000-0000-4000-8000-000000000002";

const op = (o: Partial<Op>): Op => ({
	opId: "00000000-0000-4000-8000-0000000000ff",
	deviceId: "00000000-0000-4000-8000-0000000000aa",
	entityType: "work_order",
	entityId: ORDER,
	kind: "upsert",
	patch: {},
	base: {},
	hlc: "0000000000001-0000-00000000",
	clientVersion: "test",
	...o,
});

const records = new Map<string, Fields>([
	[ORDER, { title: "Fix pump" }],
	[ITEM, { orderId: ORDER, label: "Check valve", done: false }],
]);

beforeAll(() =>
	i18n.init({
		lng: "en",
		resources: { en: { translation: en } },
		interpolation: { escapeValue: false },
	}),
);

describe("changeText", () => {
	it("tells a new job from an edit, naming the fields", () => {
		expect(
			changeText(op({ patch: { title: "Fix pump", status: "open" } }), records),
		).toBe("New job: “Fix pump”");
		expect(
			changeText(
				op({ patch: { dueDate: "2026-12-01", priority: "low" } }),
				records,
			),
		).toBe("“Fix pump”: due date, priority changed");
	});

	it("names a job by its title in the change when the device never had it", () => {
		expect(
			changeText(
				op({ patch: { title: "Paint gate", status: "open" } }),
				new Map(),
			),
		).toBe("New job: “Paint gate”");
	});

	it("says so when the job is no longer on this device, e.g. reassigned away", () => {
		expect(changeText(op({ patch: { notes: "Done" } }), new Map())).toBe(
			"A job no longer on this device: notes changed",
		);
		expect(
			changeText(
				op({
					entityType: "part",
					entityId: ITEM,
					patch: { orderId: ORDER, name: "Seal" },
				}),
				new Map(),
			),
		).toBe("Part “Seal” noted on a job no longer on this device");
	});

	it("names a step that lost its label", () => {
		expect(
			changeText(
				op({
					entityType: "checklist_item",
					entityId: ITEM,
					patch: { orderId: ORDER, done: true },
				}),
				new Map([[ORDER, { title: "Fix pump" }]]),
			),
		).toBe("Step (unnamed) ticked on “Fix pump”");
	});

	it("reads well in French too", async () => {
		const { fr } = await import("../i18n/fr.ts");
		i18n.addResourceBundle("fr", "translation", fr);
		await i18n.changeLanguage("fr");
		expect(changeText(op({ patch: { notes: "Fait" } }), new Map())).toBe(
			"Une intervention qui n'est plus sur cet appareil : notes modifié(s)",
		);
		expect(changeText(op({ kind: "delete" }), records)).toBe(
			"« Fix pump » : intervention supprimée",
		);
		await i18n.changeLanguage("en");
	});

	it("covers deleting and restoring", () => {
		expect(changeText(op({ kind: "delete" }), records)).toBe(
			"“Fix pump”: job deleted",
		);
		expect(changeText(op({ kind: "restore" }), records)).toBe(
			"“Fix pump”: job restored",
		);
	});

	it("names a step and its job, ticked or not", () => {
		const step = (patch: Op["patch"]) =>
			changeText(
				op({ entityType: "checklist_item", entityId: ITEM, patch }),
				records,
			);
		expect(step({ done: true })).toBe(
			"Step “Check valve” ticked on “Fix pump”",
		);
		expect(step({ done: false })).toBe(
			"Step “Check valve” unticked on “Fix pump”",
		);
		expect(step({ label: "Check both valves" })).toBe(
			"Step “Check both valves” saved on “Fix pump”",
		);
	});

	it("covers parts, time and photos", () => {
		const child = (
			entityType: string,
			patch: Op["patch"],
			kind: Op["kind"] = "upsert",
		) =>
			changeText(
				op({
					entityType,
					entityId: ITEM,
					kind,
					patch: { orderId: ORDER, ...patch },
				}),
				new Map([[ORDER, { title: "Fix pump" }]]),
			);
		expect(child("part", { name: "Seal" })).toBe(
			"Part “Seal” noted on “Fix pump”",
		);
		expect(child("time_entry", { startedAt: "x" })).toBe(
			"Timer started on “Fix pump”",
		);
		expect(child("time_entry", { endedAt: "y" })).toBe(
			"Time logged on “Fix pump”",
		);
		expect(child("photo", { takenAt: "x" })).toBe("Photo added to “Fix pump”");
		expect(child("photo", { signer: "Mme Okemba" })).toBe(
			"Signed by Mme Okemba on “Fix pump”",
		);
		expect(child("photo", {}, "delete")).toBe("Photo deleted from “Fix pump”");
	});

	it("does not call a caption edit on a signature a new signature", () => {
		const signature = new Map<string, Fields>([
			[ORDER, { title: "Fix pump" }],
			[ITEM, { orderId: ORDER, signer: "Mme Okemba" }],
		]);
		expect(
			changeText(
				op({
					entityType: "photo",
					entityId: ITEM,
					patch: { caption: "Front" },
				}),
				signature,
			),
		).toBe("Photo caption changed on “Fix pump”");
	});

	it("names sites, and falls back for unknown records", () => {
		const site = (kind: Op["kind"]) =>
			changeText(
				op({ entityType: "site", kind, patch: { name: "Bakery" } }),
				new Map(),
			);
		expect(site("upsert")).toBe("Site “Bakery” saved");
		expect(site("delete")).toBe("Site “Bakery” deleted");
		expect(changeText(op({ entityType: "invoice" }), records)).toBe(
			"Change saved",
		);
	});
});

describe("reasonOf", () => {
	it("knows the server's refusals and groups the rest", () => {
		expect(reasonOf("FORBIDDEN")).toBe("FORBIDDEN");
		expect(reasonOf("CLOCK_DRIFT")).toBe("CLOCK_DRIFT");
		expect(reasonOf("SOMETHING_NEW")).toBe("other");
	});
});
