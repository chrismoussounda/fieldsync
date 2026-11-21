import { describe, expect, it } from "vitest";
import {
	canAddPhoto,
	canChangePhoto,
	isPhotoChange,
	isValidPhotoPatch,
	MAX_PHOTO_BYTES,
} from "./index.ts";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const tech = { id: ME, role: "technician" as const };
const office = { id: OTHER, role: "dispatcher" as const };
const mine = { title: "Fix pump", assigneeId: ME };
const theirs = { title: "Fix pump", assigneeId: OTHER };

const photo = {
	orderId: "00000000-0000-4000-8000-0000000000aa",
	contentType: "image/jpeg",
	size: 1234,
	takenBy: ME,
	takenAt: "2026-11-21T10:00:00.000Z",
};

describe("isValidPhotoPatch", () => {
	it("accepts a new photo", () => {
		expect(isValidPhotoPatch({ ...photo, caption: "The pump" })).toBe(true);
	});

	it("refuses unknown fields and odd values", () => {
		expect(isValidPhotoPatch({ status: "done" })).toBe(false);
		expect(isValidPhotoPatch({ contentType: "image/gif" })).toBe(false);
		expect(isValidPhotoPatch({ size: MAX_PHOTO_BYTES + 1 })).toBe(false);
		expect(isValidPhotoPatch({ size: 1.5 })).toBe(false);
		expect(isValidPhotoPatch({ takenAt: "yesterday" })).toBe(false);
		expect(isValidPhotoPatch({ caption: " " })).toBe(false);
		expect(isValidPhotoPatch({ caption: null })).toBe(true);
	});
});

describe("who may do what", () => {
	it("lets the office and the assigned technician add photos", () => {
		expect(canAddPhoto(office, theirs)).toBe(true);
		expect(canAddPhoto(tech, mine)).toBe(true);
		expect(canAddPhoto(tech, theirs)).toBe(false);
		expect(canAddPhoto(office, null)).toBe(false);
	});

	it("lets a technician change only their own photos, while the order is theirs", () => {
		const byOther = { ...photo, takenBy: OTHER };
		expect(canChangePhoto(tech, mine, photo)).toBe(true);
		expect(canChangePhoto(tech, mine, byOther)).toBe(false);
		expect(canChangePhoto(tech, theirs, photo)).toBe(false);
		expect(canChangePhoto(office, theirs, photo)).toBe(true);
	});

	it("credits a new photo to its author and keeps it fixed after", () => {
		expect(isPhotoChange(tech, photo, null)).toBe(true);
		expect(isPhotoChange(tech, { ...photo, takenBy: OTHER }, null)).toBe(false);
		expect(isPhotoChange(tech, { caption: "x" }, null)).toBe(false);
		expect(isPhotoChange(tech, { caption: "x" }, photo)).toBe(true);
		expect(isPhotoChange(tech, { size: 9 }, photo)).toBe(false);
	});
});
