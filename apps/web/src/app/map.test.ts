import { describe, expect, it } from "vitest";
import type { Order } from "../orders.ts";
import { ALL, jobsOnMap, placeOf } from "./map.ts";
import type { Site } from "./sites.ts";

const order = (o: Partial<Order>): Order => ({
	id: "o1",
	title: "Fix pump",
	description: "",
	address: "",
	priority: "normal",
	status: "assigned",
	assigneeId: "junior",
	dueDate: "2026-11-24",
	siteId: null,
	location: { lat: -4.26, lng: 15.24 },
	notes: "",
	...o,
});

const site: Site = {
	id: "s1",
	name: "Plateau",
	address: "",
	contactName: "",
	contactPhone: "",
	accessNotes: "",
	location: { lat: -4.27, lng: 15.28 },
};
const sites = new Map([[site.id, site]]);
const filters = { status: "active", assignee: ALL, day: "" };

describe("placeOf", () => {
	it("takes the job's own pin, else its site's", () => {
		expect(placeOf(order({}), sites)).toEqual({ lat: -4.26, lng: 15.24 });
		expect(placeOf(order({ location: null, siteId: "s1" }), sites)).toEqual(
			site.location,
		);
		expect(placeOf(order({ location: null }), sites)).toBeNull();
	});
});

describe("jobsOnMap", () => {
	it("pins jobs with a place and lists the others", () => {
		const a = order({ id: "a" });
		const b = order({ id: "b", location: null });
		const c = order({ id: "c", location: null, siteId: "s1" });
		const { pinned, unpinned } = jobsOnMap([a, b, c], sites, filters);
		expect(pinned.map((p) => p.order.id)).toEqual(["a", "c"]);
		expect(unpinned).toEqual([b]);
	});

	it("leaves out finished jobs unless asked for every status", () => {
		const jobs = [order({ id: "a" }), order({ id: "b", status: "done" })];
		expect(jobsOnMap(jobs, sites, filters).pinned).toHaveLength(1);
		expect(
			jobsOnMap(jobs, sites, { ...filters, status: ALL }).pinned,
		).toHaveLength(2);
		expect(
			jobsOnMap(jobs, sites, { ...filters, status: "done" }).pinned.map(
				(p) => p.order.id,
			),
		).toEqual(["b"]);
	});

	it("keeps one technician's jobs, or the unassigned ones", () => {
		const jobs = [
			order({ id: "a" }),
			order({ id: "b", assigneeId: "grace" }),
			order({ id: "c", assigneeId: null, status: "open" }),
		];
		const ids = (assignee: string) =>
			jobsOnMap(jobs, sites, { ...filters, assignee }).pinned.map(
				(p) => p.order.id,
			);
		expect(ids("grace")).toEqual(["b"]);
		expect(ids("none")).toEqual(["c"]);
		expect(ids(ALL)).toEqual(["a", "b", "c"]);
	});

	it("keeps one day's jobs when a day is set", () => {
		const jobs = [
			order({ id: "a" }),
			order({ id: "b", dueDate: "2026-11-25" }),
			order({ id: "c", dueDate: null }),
		];
		expect(
			jobsOnMap(jobs, sites, { ...filters, day: "2026-11-25" }).pinned.map(
				(p) => p.order.id,
			),
		).toEqual(["b"]);
	});

	it("lists the most urgent work first", () => {
		const jobs = [
			order({ id: "low", priority: "low" }),
			order({ id: "urgent", priority: "urgent" }),
		];
		expect(jobsOnMap(jobs, sites, filters).pinned[0]?.order.id).toBe("urgent");
	});
});
