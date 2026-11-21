import { type EntityState, inScope } from "@fieldsync/protocol";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { readEntity } from "./records.ts";

/**
 * Who a device syncs for: null sees every record, a string only the records
 * in that scope (a technician and the orders assigned to them) and those
 * shared with everyone.
 */
export type Audience = string | null;

export type EntityRef = { type: string; id: string };

/** How records are shared out between devices. */
export type Scoping = {
	/**
	 * The scope of a record with no parent; null when only full-access devices
	 * see it, EVERYONE when all do.
	 */
	scopeOf(entityType: string, state: EntityState): string | null;
	/**
	 * The record this one belongs to, like a photo's order. A child shares its
	 * parent's scope. One level only: a parent has no parent itself.
	 */
	parentOf(
		entityType: string,
		entityId: string,
		state: EntityState,
	): EntityRef | null;
};

export const UNSCOPED: Scoping = {
	scopeOf: () => null,
	parentOf: () => null,
};

/** A record's scope, given its parent's state when it has one. */
export function scopeWith(
	scoping: Scoping,
	entityType: string,
	entityId: string,
	state: EntityState,
	parent: EntityState | null,
): string | null {
	const ref = scoping.parentOf(entityType, entityId, state);
	if (!ref) return scoping.scopeOf(entityType, state);
	return parent ? scoping.scopeOf(ref.type, parent) : null;
}

/** Whether a device syncing for `audience` may hold this record. */
export async function canSee(
	db: Kysely<Database>,
	orgId: string,
	audience: Audience,
	scoping: Scoping,
	entityType: string,
	entityId: string,
	state: EntityState,
): Promise<boolean> {
	if (audience === null) return true;
	const ref = scoping.parentOf(entityType, entityId, state);
	const parent = ref ? await readEntity(db, orgId, ref.type, ref.id) : null;
	return inScope(
		scopeWith(scoping, entityType, entityId, state, parent),
		audience,
	);
}
