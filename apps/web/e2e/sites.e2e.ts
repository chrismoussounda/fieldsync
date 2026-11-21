import { expect, test } from "@playwright/test";
import { device, JUNIOR, open, save, sync } from "./devices.ts";

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

	await office.goto("/#/new");
	await office.getByLabel("Title").fill(title);
	await office.getByLabel("Site").selectOption({ label: name });
	await expect(office.getByLabel("Address")).toHaveValue(
		"Avenue Matsoua, Brazzaville",
	);
	await office.getByLabel("Assigned to").selectOption({ label: JUNIOR });
	await save(office);
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await tech.context().setOffline(true);
	await open(tech, title);
	const info = tech.locator(".site-info");
	await expect(info).toContainText("Ring twice at the blue gate");
	await expect(
		info.getByRole("link", { name: "+242 06 000 0009" }),
	).toHaveAttribute("href", "tel:+242060000009");
	await info.getByRole("link", { name: "Site page and past jobs" }).click();
	await expect(tech.getByLabel("Name")).toBeDisabled();
	await expect(tech.getByRole("button", { name: "Save" })).toHaveCount(0);
	await expect(tech.getByRole("link", { name: title })).toContainText(
		"Assigned",
	);

	await tech.context().setOffline(false);
	await open(office, title);
	await office.getByRole("link", { name: "Site page and past jobs" }).click();
	await office.getByLabel("Phone").fill("+242 06 000 0010");
	await office.getByRole("button", { name: "Save", exact: true }).click();
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await open(tech, title);
	await expect(tech.locator(".site-info")).toContainText("+242 06 000 0010");
});
