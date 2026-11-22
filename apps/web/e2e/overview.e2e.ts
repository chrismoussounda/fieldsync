import { expect, test } from "@playwright/test";
import { createOrder, device, JUNIOR } from "./devices.ts";

test("the office finds work from the overview and the filters", async ({
	browser,
}) => {
	const title = `Roof leak ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await createOrder(office, title, "Unassigned");

	// A tile opens the list with its filter set.
	await office.getByRole("link", { name: "Overview" }).click();
	await expect(office.getByRole("heading", { name: "Overview" })).toBeVisible();
	await office.getByRole("link", { name: /^\d+ Unassigned$/ }).click();
	const assignee = office.getByRole("button", { name: /Assigned to/ });
	await expect(assignee).toContainText("Unassigned");
	await expect(office.getByRole("link", { name: title })).toBeVisible();
	await expect(
		office.getByRole("link", { name: /Check the solar panels/ }),
	).toBeVisible();
	await expect(
		office.getByRole("link", { name: /Replace the water pump/ }),
	).toHaveCount(0);

	// Every word must match, whatever the case.
	await office.getByLabel("Search").fill("SOLAR kintele");
	await expect(
		office.getByRole("link", { name: /Check the solar panels/ }),
	).toBeVisible();
	await expect(office.getByRole("link", { name: title })).toHaveCount(0);

	// A technician's row lists their work; the seeded generator job is late.
	await office.getByRole("link", { name: "Overview" }).click();
	await expect(office.getByRole("heading", { name: "Overview" })).toBeVisible();
	const row = office.getByRole("row", { name: new RegExp(JUNIOR) });
	await expect(row.getByRole("cell").nth(2)).not.toHaveText("0");
	await row.getByRole("link", { name: JUNIOR }).click();
	const late = office
		.getByRole("row")
		.filter({ hasText: "Inspect the generator" });
	await expect(late).toContainText("Overdue");
	await expect(office.getByLabel("Search")).toHaveValue("");

	// The filters stay when coming back from an order.
	await late.getByRole("link").click();
	await office.getByRole("link", { name: "Back" }).click();
	await expect(assignee).not.toContainText("Anyone");
	await office.getByRole("button", { name: "Clear filters" }).click();
	await expect(assignee).toContainText("Anyone");
});
