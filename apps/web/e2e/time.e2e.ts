import { expect, test } from "@playwright/test";
import { createOrder, device, JUNIOR, open, sync } from "./devices.ts";

test("a technician clocks time on site offline; the office sees the hours", async ({
	browser,
}) => {
	const title = `Timed job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.clock.install();
	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByRole("button", { name: "Start" }).click();
	await expect(tech.locator(".time")).toContainText("On site since");
	await expect(tech.getByLabel("Status")).toHaveValue("in_progress");

	await tech.clock.fastForward("01:30:00");
	await tech.getByRole("button", { name: "Stop" }).click();
	await expect(tech.locator(".time")).toContainText("1 h 30 in all");

	await tech.context().setOffline(false);
	await tech.clock.fastForward("00:00:20");
	await expect(tech.locator(".badge")).toHaveText("Synced");

	await sync(office);
	await open(office, title);
	await expect(office.locator(".time")).toContainText("1 h 30 in all");
	await expect(office.locator(".time")).toContainText(JUNIOR);

	await office.goto("/#/overview");
	const row = office.getByRole("row", { name: new RegExp(JUNIOR) });
	await expect(row.getByRole("cell").last()).not.toHaveText("–");
});
