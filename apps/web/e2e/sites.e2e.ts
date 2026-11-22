import { expect, test } from "@playwright/test";
import {
	device,
	JUNIOR,
	open,
	pick,
	saveSheet,
	section,
	sync,
} from "./devices.ts";

test("a site is kept once, picked on its orders and read on site", async ({
	browser,
}) => {
	const name = `Garage ${Date.now()}`;
	const title = `Brakes at ${name}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");

	await office.goto("/#/sites");
	await office.getByRole("link", { name: "New site" }).click();
	await office.getByLabel("Name").fill(name);
	await office.getByLabel("Address").fill("Avenue Matsoua, Brazzaville");
	await office.getByLabel("Contact").fill("M. Ngoma");
	await office.getByLabel("Phone").fill("+242 06 000 0009");
	await office.getByLabel("Access notes").fill("Ring twice at the blue gate");
	await office.getByRole("button", { name: "Save", exact: true }).click();
	await expect(office.getByRole("link", { name })).toBeVisible();

	await office.goto("/#/?new=1");
	const sheet = office.getByRole("dialog");
	await sheet.getByLabel("Title").fill(title);
	await pick(office, "Site", name);
	await expect(sheet.getByLabel("Address")).toHaveValue(
		"Avenue Matsoua, Brazzaville",
	);
	await pick(office, "Assigned to", JUNIOR);
	await saveSheet(office);
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await tech.context().setOffline(true);
	await open(tech, title);
	const info = section(tech, "Site");
	await expect(info).toContainText("Ring twice at the blue gate");
	await expect(
		info.getByRole("link", { name: "+242 06 000 0009" }),
	).toHaveAttribute("href", "tel:+242060000009");
	await info.getByRole("link", { name: "Site page and past jobs" }).click();
	await expect(tech.getByRole("heading", { name })).toBeVisible();
	await expect(tech.getByRole("button", { name: "Edit" })).toHaveCount(0);
	await expect(tech.getByRole("link", { name: title })).toContainText(
		"Assigned",
	);

	await tech.context().setOffline(false);
	await open(office, title);
	await office.getByRole("link", { name: "Site page and past jobs" }).click();
	await office.getByRole("button", { name: "Edit" }).click();
	await office.getByLabel("Phone").fill("+242 06 000 0010");
	await office.getByRole("button", { name: "Save", exact: true }).click();
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await open(tech, title);
	await expect(section(tech, "Site")).toContainText("+242 06 000 0010");
});

test("on a phone, a site is added from a bottom drawer", async ({
	browser,
}) => {
	const name = `Kiosk ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await office.setViewportSize({ width: 390, height: 844 });
	await office.goto("/#/sites");
	await office.getByRole("link", { name: "New site" }).click();
	await office.getByRole("button", { name: "Save" }).click();
	await expect(office.getByText("Give the site a name.")).toBeVisible();
	await office.getByLabel("Name").fill(name);
	await office.getByRole("button", { name: "Save" }).click();
	await expect(office.getByRole("dialog")).toHaveCount(0);
	await office.getByRole("link", { name }).click();
	await expect(office.getByRole("heading", { name })).toBeVisible();
});

test("on a desktop, the sites are a table: a row opens its site, search narrows it", async ({
	browser,
}) => {
	const name = `Pharmacy ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await office.goto("/#/sites?new=1");
	await office.getByLabel("Name").fill(name);
	await office.getByLabel("Contact").fill("Mme Loubaki");
	await saveSheet(office);

	await office.goto("/#/?new=1");
	await office
		.getByRole("dialog")
		.getByLabel("Title")
		.fill(`Shelves at ${name}`);
	await pick(office, "Site", name);
	await saveSheet(office);

	await office.goto("/#/sites");
	const table = office.getByRole("grid", { name: "Customer sites" });
	const row = table.getByRole("row").filter({ hasText: name });
	await expect(row).toContainText("Mme Loubaki");
	await expect(row).toContainText("1 open");

	await office.getByRole("searchbox").fill("no such site anywhere");
	await expect(office.getByText("No site matches.")).toBeVisible();
	await office.getByRole("searchbox").fill(name.toLowerCase());
	await expect(table.getByRole("row")).toHaveCount(2);

	// Anywhere on the row opens the site, not only its name.
	await row.click({ position: { x: 600, y: 20 } });
	await expect(office.getByRole("heading", { name })).toBeVisible();
});
