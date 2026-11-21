/** The scope of records every device syncs, like customer sites. */
export const EVERYONE = "*";

/**
 * Whether a device syncing for `audience` holds records in `scope`: null sees
 * everything, a technician their own scope and the shared one.
 */
export function inScope(
	scope: string | null,
	audience: string | null,
): boolean {
	return audience === null || scope === audience || scope === EVERYONE;
}
