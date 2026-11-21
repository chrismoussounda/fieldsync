import { canManage, type Role } from "./index.ts";

/** A photo of a work order; the image itself is uploaded separately. */
export const PHOTO = "photo";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const MAX_CAPTION = 200;

/** Set once, when the photo is taken. */
const FIXED = ["orderId", "contentType", "size", "takenBy", "takenAt"] as const;
export const PHOTO_FIELDS = [...FIXED, "caption"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidPhotoPatch(patch: Record<string, unknown>): boolean {
	return Object.entries(patch).every(([field, value]) => {
		switch (field) {
			case "orderId":
			case "takenBy":
				return typeof value === "string" && UUID.test(value);
			case "contentType":
				return (PHOTO_TYPES as readonly unknown[]).includes(value);
			case "size":
				return (
					Number.isInteger(value) &&
					(value as number) > 0 &&
					(value as number) <= MAX_PHOTO_BYTES
				);
			case "takenAt":
				return typeof value === "string" && !Number.isNaN(Date.parse(value));
			case "caption":
				return (
					value === null ||
					(typeof value === "string" &&
						value.trim().length > 0 &&
						value.length <= MAX_CAPTION)
				);
			default:
				return false;
		}
	});
}

type User = { id: string; role: Role };
type Fields = Record<string, unknown>;

/**
 * Who may add photos to an order: the office, and the technician it is
 * assigned to.
 */
export function canAddPhoto(user: User, order: Fields | null): boolean {
	if (!order) return false;
	return canManage(user.role) || order.assigneeId === user.id;
}

/**
 * Who may caption or delete a photo: the office, and the technician who took
 * it while the order is still theirs.
 */
export function canChangePhoto(
	user: User,
	order: Fields | null,
	photo: Fields,
): boolean {
	if (canManage(user.role)) return true;
	return canAddPhoto(user, order) && photo.takenBy === user.id;
}

/**
 * Whether an operation's fields suit a photo as it stands: a new one has every
 * fixed field and is credited to its author; the fixed fields never change.
 */
export function isPhotoChange(
	user: User,
	patch: Fields,
	current: Fields | null,
): boolean {
	if (!current) {
		return FIXED.every((f) => f in patch) && patch.takenBy === user.id;
	}
	return FIXED.every((f) => !(f in patch));
}
