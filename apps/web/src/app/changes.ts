import type { Op } from "@fieldsync/protocol";
import {
	CHECKLIST_ITEM,
	PART,
	PHOTO,
	SITE,
	TIME_ENTRY,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import i18n from "i18next";
import type { fr } from "../i18n/fr.ts";
import { fieldLabel } from "../orders.ts";

/** A stored record's fields, by id. */
export type Fields = Record<string, unknown>;
type Change = keyof typeof fr.debug.change;

/** Server refusals the app can explain; anything else gets a general sentence. */
const REASONS = ["FORBIDDEN", "INVALID_OP", "CLOCK_DRIFT"] as const;
export const reasonOf = (reason: string) =>
	REASONS.find((r) => r === reason) ?? "other";

/** A name in quotes, or a few words when the record is unknown here. */
const named = (text: unknown, unknown: "unnamed" | "goneOrder" = "unnamed") =>
	typeof text === "string" && text
		? i18n.t("debug.change.quoted", { name: text })
		: i18n.t(`debug.change.${unknown}`);

const capitalised = (text: string) =>
	text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** One waiting change as a sentence: what was done, and to which job or site. */
export function changeText(
	op: Op,
	records: ReadonlyMap<string, Fields> | undefined,
): string {
	const own: Fields = { ...records?.get(op.entityId), ...op.patch };
	const changed = (field: string) => field in op.patch;
	const orderId = op.entityType === WORK_ORDER ? op.entityId : own.orderId;
	// A job reassigned away is no longer on this device; only its id is left.
	const order = named(
		records?.get(String(orderId))?.title ?? own.title,
		"goneOrder",
	);
	const say = (key: Change, values: Record<string, string> = {}) =>
		capitalised(i18n.t(`debug.change.${key}`, { order, ...values }));

	switch (op.entityType) {
		case WORK_ORDER:
			if (op.kind === "delete") return say("orderDeleted");
			if (op.kind === "restore") return say("orderRestored");
			if (changed("title") && changed("status")) return say("orderCreated");
			return say("orderEdited", {
				fields: Object.keys(op.patch)
					.map((f) => fieldLabel(f).toLowerCase())
					.join(", "),
			});
		case CHECKLIST_ITEM:
			if (op.kind === "delete") return say("stepDeleted");
			if (changed("done")) {
				return say(own.done ? "stepTicked" : "stepUnticked", {
					step: named(own.label),
				});
			}
			return say("stepSaved", { step: named(own.label) });
		case PART:
			return say(op.kind === "delete" ? "partDeleted" : "partSaved", {
				part: named(own.name),
			});
		case TIME_ENTRY:
			if (op.kind === "delete") return say("timeDeleted");
			return say(
				changed("endedAt") && own.endedAt ? "timeStopped" : "timeStarted",
			);
		case PHOTO:
			if (op.kind === "delete") {
				return say(own.signer ? "signatureDeleted" : "photoDeleted");
			}
			if (changed("signer")) return say("signed", { name: String(own.signer) });
			return say(changed("orderId") ? "photoAdded" : "captionSaved");
		case SITE: {
			const site = named(own.name);
			if (op.kind === "delete") return say("siteDeleted", { site });
			if (op.kind === "restore") return say("siteRestored", { site });
			return say("siteSaved", { site });
		}
		default:
			return say("other");
	}
}
