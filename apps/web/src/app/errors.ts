import { HttpError } from "@fieldsync/sync-client";

/** Matches the API's rule. */
export const MIN_PASSWORD = 10;

const MESSAGES: Record<string, string> = {
	BAD_REQUEST: "The server could not accept this. Check the fields.",
	FORBIDDEN: "Your role may not do this.",
	NOT_FOUND: "This person is no longer in the team.",
	EMAIL_TAKEN: "Someone in the team already uses this email.",
	OWN_ACCOUNT: "You cannot change your own role or disable yourself.",
	WRONG_PASSWORD: "The current password is not right.",
	RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
};

/** A sentence for the user; requests that never reached the server mean offline. */
export function messageFor(
	error: unknown,
	extra: Record<string, string> = {},
): string {
	if (!(error instanceof HttpError)) {
		return "No connection. This needs the network.";
	}
	const code = error.code ?? "";
	return extra[code] ?? MESSAGES[code] ?? "The server refused this.";
}
