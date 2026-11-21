import type { EntityState } from "@fieldsync/protocol";

/**
 * Who a device syncs for: null sees every record, a string only the records
 * in that scope (a technician and the orders assigned to them).
 */
export type Audience = string | null;

/** The scope a record is in; null when only full-access devices see it. */
export type ScopeOf = (entityType: string, state: EntityState) => string | null;

export const unscoped: ScopeOf = () => null;

export function canSee(
	audience: Audience,
	scopeOf: ScopeOf,
	entityType: string,
	state: EntityState,
): boolean {
	return audience === null || scopeOf(entityType, state) === audience;
}
