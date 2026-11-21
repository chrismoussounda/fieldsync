import { canManage, type Role } from "./index.ts";

/** A customer's place of work, kept once and picked on each of its orders. */
export const SITE = "site";

export const SITE_FIELDS = [
	"name",
	"address",
	"contactName",
	"contactPhone",
	"accessNotes",
] as const;

export const MAX_SITE_LENGTH = {
	name: 200,
	address: 300,
	contactName: 200,
	contactPhone: 40,
	accessNotes: 2000,
} as const;

const PHONE = /^\+?[0-9 ().-]+$/;

export function isValidSitePatch(patch: Record<string, unknown>): boolean {
	return Object.entries(patch).every(([field, value]) => {
		if (!(SITE_FIELDS as readonly string[]).includes(field)) return false;
		if (value === null) return field !== "name";
		if (typeof value !== "string" || value.trim().length === 0) return false;
		if (value.length > MAX_SITE_LENGTH[field as keyof typeof MAX_SITE_LENGTH]) {
			return false;
		}
		return field !== "contactPhone" || PHONE.test(value);
	});
}

/** The office keeps the sites; technicians read them. */
export function mayChangeSite(
	user: { id: string; role: Role },
	current: Record<string, unknown> | null,
	patch: Record<string, unknown>,
	kind: "upsert" | "delete" | "restore",
): boolean {
	if (!canManage(user.role)) return false;
	return kind !== "upsert" || current !== null || "name" in patch;
}
