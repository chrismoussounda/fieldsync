import { type EntityState, isDeleted } from "@fieldsync/merge";
import {
	FIELDS,
	type Field,
	isLocation,
	type Location,
	PRIORITIES,
	STATUSES,
} from "@fieldsync/work-orders";
import i18n from "i18next";
import { formatDay } from "./lib/format.ts";
import { formatLocation } from "./lib/maps.ts";

export { WORK_ORDER } from "@fieldsync/work-orders";

export type Order = {
	id: string;
	title: string;
	description: string;
	address: string;
	priority: string;
	status: string;
	assigneeId: string | null;
	dueDate: string | null;
	siteId: string | null;
	location: Location | null;
	notes: string;
};

const FIELD_NAMES = [
	"title",
	"description",
	"address",
	"priority",
	"assigneeId",
	"dueDate",
	"siteId",
	"location",
	"status",
	"notes",
] as const;

export function fieldLabel(field: string): string {
	const known = FIELD_NAMES.find((f) => f === field);
	return known ? i18n.t(`fields.${known}`) : field;
}

export function statusLabel(status: string): string {
	const known = STATUSES.find((s) => s === status);
	return known ? i18n.t(`status.${known}`) : status;
}

export function priorityLabel(priority: string): string {
	const known = PRIORITIES.find((p) => p === priority);
	return known ? i18n.t(`priority.${known}`) : priority;
}

const SHORT = 80;

/** A field's value as a person reads it; assignees and sites by name. */
export function describeValue(
	field: string,
	value: unknown,
	names: ReadonlyMap<string, string>,
): string {
	if (value === null || value === undefined || value === "") {
		return i18n.t("values.empty");
	}
	const text = typeof value === "string" ? value : JSON.stringify(value);
	if (field === "assigneeId")
		return names.get(text) ?? i18n.t("values.someone");
	if (field === "siteId") {
		return names.get(text) ?? i18n.t("values.removedSite");
	}
	if (field === "status") return statusLabel(text);
	if (field === "priority") return priorityLabel(text);
	if (field === "dueDate") return formatDay(text);
	if (field === "location") {
		return isLocation(value) ? formatLocation(value) : i18n.t("values.empty");
	}
	return text.length > SHORT ? `${text.slice(0, SHORT - 1)}…` : text;
}

/** Reads a stored record as a work order; null once it is deleted. */
export function toOrder(id: string, state: EntityState): Order | null {
	if (isDeleted(state)) return null;
	const f = state.fields;
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	return {
		id,
		title: text(f.title) || "Untitled",
		description: text(f.description),
		address: text(f.address),
		priority: text(f.priority) || "normal",
		status: text(f.status) || "open",
		assigneeId: text(f.assigneeId) || null,
		dueDate: text(f.dueDate) || null,
		siteId: text(f.siteId) || null,
		location: isLocation(f.location) ? f.location : null,
		notes: text(f.notes),
	};
}

const rank = (p: string) => (PRIORITIES as readonly string[]).indexOf(p);

/** Unfinished first, then by priority and due date. */
export function byUrgency(a: Order, b: Order): number {
	const finished = (o: Order) => (o.status === "done" ? 1 : 0);
	return (
		finished(a) - finished(b) ||
		rank(a.priority) - rank(b.priority) ||
		(a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")
	);
}

type TextField = Exclude<Field, "location">;

/** What a form edits: every field as text, empty when unset, and the map point. */
export type Draft = Record<TextField, string> & { location: Location | null };

export function toDraft(state: EntityState | null): Draft {
	const draft = { location: null } as Draft;
	for (const field of FIELDS) {
		const value = state?.fields[field];
		if (field === "location") draft.location = isLocation(value) ? value : null;
		else draft[field] = typeof value === "string" ? value : "";
	}
	return draft;
}

const samePoint = (a: Location | null, b: Location | null) =>
	a === b || (a !== null && b !== null && a.lat === b.lat && a.lng === b.lng);

/**
 * The fields the user changed and may change. Untouched fields are left out,
 * so they cannot overwrite what someone else edited meanwhile.
 */
export function patchOf(
	before: Draft,
	after: Draft,
	editable: ReadonlySet<Field>,
): Record<string, string | Location | null> {
	const patch: Record<string, string | Location | null> = {};
	for (const field of FIELDS) {
		if (!editable.has(field)) continue;
		if (field === "location") {
			if (!samePoint(before.location, after.location)) {
				patch.location = after.location;
			}
			continue;
		}
		if (after[field] === before[field]) continue;
		const value = after[field].trim();
		patch[field] = value === "" ? null : value;
	}
	return patch;
}
