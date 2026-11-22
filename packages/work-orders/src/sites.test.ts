import { describe, expect, it } from "vitest";
import { isValidSitePatch, isValidValue, mayChangeSite } from "./index.ts";

const tech = { id: "t", role: "technician" as const };
const office = { id: "o", role: "dispatcher" as const };
const site = {
	name: "Bakery Moungali",
	address: "12 rue Mbochi, Brazzaville",
	contactName: "Mme Okemba",
	contactPhone: "+242 06 555 12 34",
	accessNotes: "Back door, ask for the key at the counter",
};

describe("isValidSitePatch", () => {
	it("accepts a site, and clearing all but its name", () => {
		expect(isValidSitePatch(site)).toBe(true);
		expect(
			isValidSitePatch({
				address: null,
				contactName: null,
				contactPhone: null,
				accessNotes: null,
			}),
		).toBe(true);
	});

	it("refuses odd values and unknown fields", () => {
		expect(isValidSitePatch({ name: null })).toBe(false);
		expect(isValidSitePatch({ name: " " })).toBe(false);
		expect(isValidSitePatch({ contactPhone: "call me" })).toBe(false);
		expect(isValidSitePatch({ address: "x".repeat(301) })).toBe(false);
		expect(isValidSitePatch({ title: "x" })).toBe(false);
	});

	it("takes a point on the map, or none", () => {
		expect(isValidSitePatch({ location: { lat: -4.27, lng: 15.28 } })).toBe(
			true,
		);
		expect(isValidSitePatch({ location: null })).toBe(true);
		expect(isValidSitePatch({ location: { lat: 91, lng: 0 } })).toBe(false);
		expect(isValidSitePatch({ location: { lat: "-4", lng: 15 } })).toBe(false);
		expect(isValidSitePatch({ location: { lat: 0, lng: 0, zoom: 3 } })).toBe(
			false,
		);
		expect(isValidSitePatch({ location: "-4.27,15.28" })).toBe(false);
	});
});

describe("mayChangeSite", () => {
	it("lets the office create, edit and remove sites", () => {
		expect(mayChangeSite(office, null, site, "upsert")).toBe(true);
		expect(mayChangeSite(office, site, { name: "Bakery" }, "upsert")).toBe(
			true,
		);
		expect(mayChangeSite(office, site, {}, "delete")).toBe(true);
	});

	it("needs a name to create one", () => {
		expect(
			mayChangeSite(office, null, { address: site.address }, "upsert"),
		).toBe(false);
	});

	it("leaves technicians to read them", () => {
		expect(mayChangeSite(tech, null, site, "upsert")).toBe(false);
		expect(
			mayChangeSite(tech, site, { accessNotes: "Code 1234" }, "upsert"),
		).toBe(false);
	});
});

it("files a work order under a site", () => {
	expect(isValidValue("siteId", "00000000-0000-4000-8000-0000000000c1")).toBe(
		true,
	);
	expect(isValidValue("siteId", null)).toBe(true);
	expect(isValidValue("siteId", "bakery")).toBe(false);
});
