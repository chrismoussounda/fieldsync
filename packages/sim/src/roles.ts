import type { EntityState, Op } from "@fieldsync/protocol";

/**
 * The simulation's stand-in for orders and technicians: a record belongs to
 * the device whose number is in its `assignee` field.
 */
export function simScope(state: EntityState): string | null {
	const assignee = state.fields.assignee;
	return typeof assignee === "number" ? String(assignee) : null;
}

/**
 * Like the app's rules: the office may do anything; a technician may only
 * edit a record that is theirs, and not reassign it.
 */
export function simAuthorize(
	op: Op,
	current: EntityState | null,
	audience: string | null,
): boolean {
	if (audience === null) return true;
	return (
		op.kind === "upsert" &&
		current !== null &&
		simScope(current) === audience &&
		!("assignee" in op.patch)
	);
}
