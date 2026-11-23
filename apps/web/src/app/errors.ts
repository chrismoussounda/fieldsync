import { HttpError } from "@fieldsync/sync-client";
import i18n from "i18next";

/** Matches the API's rule. */
export const MIN_PASSWORD = 10;

const KNOWN = [
	"BAD_REQUEST",
	"FORBIDDEN",
	"NOT_FOUND",
	"EMAIL_TAKEN",
	"OWN_ACCOUNT",
	"WRONG_PASSWORD",
	"RATE_LIMITED",
	"DEMO_ENDED",
	"DEMO_FULL",
	"DEMO_LIMIT",
] as const;

/** A sentence for the user; requests that never reached the server mean offline. */
export function messageFor(
	error: unknown,
	extra: Record<string, string> = {},
): string {
	if (!(error instanceof HttpError)) return i18n.t("errors.offline");
	const code = error.code ?? "";
	const known = KNOWN.find((k) => k === code);
	return (
		extra[code] ??
		(known ? i18n.t(`errors.${known}`) : i18n.t("errors.refused"))
	);
}
