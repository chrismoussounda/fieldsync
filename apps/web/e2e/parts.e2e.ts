import { expect, test } from "@playwright/test";
import { createOrder, device, JUNIOR, open, sync } from "./devices.ts";

test("the technician records the parts used, offline, and they reach the report", async ({
	browser,
}) => {
	const title = `Parts job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	const parts = tech.locator(".parts");
	const add = async (name: string, quantity: string, unit: string) => {
		await parts.getByLabel("Part").fill(name);
		await parts.getByLabel("Quantity").fill(quantity);
		await parts.getByLabel("Unit").fill(unit);
		await parts.getByRole("button", { name: "Add part" }).click();
		await expect(parts).toContainText(name);
	};
	await add("Pump seal 32 mm", "2", "pcs");
	await add("Copper pipe", "1.5", "m");
	await parts.getByRole("button", { name: "Remove Copper pipe" }).click();
	await expect(parts).not.toContainText("Copper pipe");

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await sync(office);
	await open(office, title);
	await expect(office.locator(".parts")).toContainText("2 pcs Pump seal 32 mm");
	await expect(office.locator(".parts")).toContainText(JUNIOR);

	await office.getByRole("link", { name: "Job report" }).click();
	const row = office.locator(".report tr", { hasText: "Pump seal 32 mm" });
	await expect(row).toContainText("2 pcs");
	await expect(office.locator(".report")).not.toContainText("Copper pipe");
});
