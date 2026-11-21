import type { EntityState } from "@fieldsync/merge";
import { EVERYONE, type Op } from "@fieldsync/protocol";
import { describe, expect, it } from "vitest";
import type { Role } from "../db/schema.ts";
import { isValidRecord, mayWrite, WORK_ORDER_SCOPING } from "./policy.ts";

const ME = "00000000-0000-4000-8000-0000000000b1";
const SOMEONE = "00000000-0000-4000-8000-0000000000b2";

function order(fields: EntityState["fields"]): EntityState {
	return {
		fields,
		clocks: {},
		createdHlc: "0000000000001-0000-0a1b2c3d",
		deletedHlc: null,
		restoredHlc: null,
	};
}

const mine = order({ title: "Fix pump", assigneeId: ME });
const theirs = order({ title: "Fix pump", assigneeId: SOMEONE });

const ORDER = "00000000-0000-4000-8000-0000000000aa";
const newPhoto = {
	orderId: ORDER,
	contentType: "image/jpeg",
	size: 1234,
	takenBy: ME,
	takenAt: "2026-11-21T10:00:00.000Z",
};
const myPhoto = order(newPhoto);
const theirPhoto = order({ ...newPhoto, takenBy: SOMEONE });

const newItem = { orderId: ORDER, label: "Close the valve", position: 1 };
const item = order(newItem);
const tick = { done: true, doneBy: ME, doneAt: "2026-11-21T10:00:00.000Z" };

const clockIn = {
	orderId: ORDER,
	technicianId: ME,
	startedAt: "2026-11-21T08:00:00.000Z",
	endedAt: null,
};
const running = order(clockIn);

const newSite = { name: "Bakery Moungali", address: "12 rue Mbochi" };

type Case = {
	action: string;
	current: EntityState | null;
	/** A photo's order. */
	parent?: EntityState;
	op: Partial<Op>;
	technician: boolean;
	dispatcher: boolean;
	admin: boolean;
};

// Read a row as: may a technician, a dispatcher and an admin do this?
const matrix: Case[] = [
	{
		action: "create a work order",
		current: null,
		op: { patch: { title: "Fix pump", assigneeId: ME } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "report progress on an assigned order",
		current: mine,
		op: { patch: { status: "in_progress", notes: "Valve replaced" } },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "report progress on someone else's order",
		current: theirs,
		op: { patch: { status: "done" } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "replan an assigned order",
		current: mine,
		op: { patch: { dueDate: "2026-12-01" } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "reassign an order",
		current: mine,
		op: { patch: { assigneeId: SOMEONE } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "delete an order",
		current: mine,
		op: { kind: "delete", patch: {} },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "restore an order",
		current: mine,
		op: { kind: "restore", patch: {} },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "write an unknown field",
		current: mine,
		op: { patch: { price: 100 } },
		technician: false,
		dispatcher: false,
		admin: false,
	},
	{
		action: "write an unknown kind of record",
		current: null,
		op: { entityType: "invoice", patch: { status: "paid" } },
		technician: false,
		dispatcher: false,
		admin: false,
	},
	{
		action: "add a photo to an assigned order",
		current: null,
		parent: mine,
		op: { entityType: "photo", patch: newPhoto },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "add a photo to someone else's order",
		current: null,
		parent: theirs,
		op: { entityType: "photo", patch: newPhoto },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "add a photo credited to someone else",
		current: null,
		parent: mine,
		op: { entityType: "photo", patch: { ...newPhoto, takenBy: SOMEONE } },
		technician: false,
		dispatcher: false,
		admin: false,
	},
	{
		action: "add a photo to an order that does not exist",
		current: null,
		op: { entityType: "photo", patch: newPhoto },
		technician: false,
		dispatcher: false,
		admin: false,
	},
	{
		action: "caption their own photo",
		current: myPhoto,
		parent: mine,
		op: { entityType: "photo", patch: { caption: "Valve" } },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "delete someone else's photo",
		current: theirPhoto,
		parent: mine,
		op: { entityType: "photo", kind: "delete", patch: {} },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "delete their own photo",
		current: myPhoto,
		parent: mine,
		op: { entityType: "photo", kind: "delete", patch: {} },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "move a photo to another order",
		current: myPhoto,
		parent: mine,
		op: { entityType: "photo", patch: { orderId: SOMEONE } },
		technician: false,
		dispatcher: false,
		admin: false,
	},
	{
		action: "add a checklist item",
		current: null,
		parent: mine,
		op: { entityType: "checklist_item", patch: newItem },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "tick an item of an assigned order",
		current: item,
		parent: mine,
		op: { entityType: "checklist_item", patch: tick },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "tick an item of someone else's order",
		current: item,
		parent: theirs,
		op: { entityType: "checklist_item", patch: tick },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "reword a checklist item",
		current: item,
		parent: mine,
		op: { entityType: "checklist_item", patch: { label: "Skip it" } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "remove a checklist item",
		current: item,
		parent: mine,
		op: { entityType: "checklist_item", kind: "delete", patch: {} },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "start the clock on an assigned order",
		current: null,
		parent: mine,
		op: { entityType: "time_entry", patch: clockIn },
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "start the clock on someone else's order",
		current: null,
		parent: theirs,
		op: { entityType: "time_entry", patch: clockIn },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "stop their clock",
		current: running,
		parent: mine,
		op: {
			entityType: "time_entry",
			patch: { endedAt: "2026-11-21T09:00:00.000Z" },
		},
		technician: true,
		dispatcher: true,
		admin: true,
	},
	{
		action: "remove a time entry",
		current: running,
		parent: mine,
		op: { entityType: "time_entry", kind: "delete", patch: {} },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "add a customer site",
		current: null,
		op: { entityType: "site", patch: newSite },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "edit a customer site",
		current: order(newSite),
		op: { entityType: "site", patch: { accessNotes: "Code 1234" } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
	{
		action: "file an order under a site",
		current: theirs,
		op: { patch: { siteId: ORDER } },
		technician: false,
		dispatcher: true,
		admin: true,
	},
];

const roles: Role[] = ["technician", "dispatcher", "admin"];

describe("mayWrite", () => {
	for (const row of matrix) {
		for (const role of roles) {
			it(`${role} ${row[role] ? "may" : "may not"} ${row.action}`, () => {
				const op = {
					entityType: "work_order",
					kind: "upsert",
					patch: {},
					...row.op,
				} as Op;
				const principal = {
					orgId: "org",
					userId: ME,
					deviceId: "device",
					role,
				};
				expect(mayWrite(principal, op, row.current, row.parent ?? null)).toBe(
					row[role],
				);
			});
		}
	}
});

it("shares customer sites with every device", () => {
	expect(WORK_ORDER_SCOPING.scopeOf("site", order(newSite))).toBe(EVERYONE);
	expect(WORK_ORDER_SCOPING.scopeOf("work_order", theirs)).toBe(SOMEONE);
});

it("checks a site's values", () => {
	const site = (patch: Op["patch"]) =>
		({ entityType: "site", kind: "upsert", patch }) as Op;
	expect(isValidRecord(site(newSite), new Set())).toBe(true);
	expect(isValidRecord(site({ contactPhone: "soon" }), new Set())).toBe(false);
});
