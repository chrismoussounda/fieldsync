import { describe, expect, it } from "vitest";
import { editableFields, FIELDS, PROGRESS_FIELDS } from "./index.ts";

const order = { title: "Fix pump", assigneeId: "me" };

describe("editableFields", () => {
	it("lets dispatchers and admins change everything", () => {
		for (const role of ["dispatcher", "admin"] as const) {
			expect([...editableFields({ id: "x", role }, order)]).toEqual(FIELDS);
		}
	});

	it("lets a technician report progress on their own orders only", () => {
		const tech = (id: string) =>
			editableFields({ id, role: "technician" }, order);
		expect([...tech("me")]).toEqual(PROGRESS_FIELDS);
		expect(tech("someone else").size).toBe(0);
		expect(editableFields({ id: "me", role: "technician" }, null).size).toBe(0);
	});
});
