import type { EntityState } from "@fieldsync/merge";
import type { Op } from "@fieldsync/protocol";
import { describe, expect, it } from "vitest";
import type { Role } from "../db/schema.ts";
import { mayWrite } from "./policy.ts";

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
