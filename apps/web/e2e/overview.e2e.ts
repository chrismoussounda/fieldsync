import { expect, test } from "@playwright/test";
import { createOrder, device, JUNIOR } from "./devices.ts";

test("the office finds work from the overview and the filters", async ({
	browser,
}) => {
	const title = `Unassigned leak ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await createOrder(office, title, "Unassigned");

	// A tile opens the list with its filter set.
	await office.getByRole("link", { name: "Overview" }).click();
	await office.getByRole("link", { name: /Unassigned/ }).click();
	await expect(office.getByLabel("Assigned to")).toHaveValue("none");
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
	const row = office.getByRole("row", { name: new RegExp(JUNIOR) });
	await expect(row.getByRole("cell").nth(2)).not.toHaveText("0");
	await row.getByRole("link", { name: JUNIOR }).click();
	const late = office.getByRole("link", { name: /Inspect the generator/ });
	await expect(late).toContainText("Overdue");
	await expect(office.getByLabel("Search")).toHaveValue("");

	// The filters stay when coming back from an order.
	await late.click();
	await office.getByRole("link", { name: "Back" }).click();
	await expect(office.getByLabel("Assigned to")).not.toHaveValue("all");
	await office.getByRole("button", { name: "Clear filters" }).click();
	await expect(office.getByLabel("Assigned to")).toHaveValue("all");
});
