import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	MERVEILLE,
	open,
	save,
	sync,
} from "./devices.ts";

test("an edit made offline reaches the office once back online", async ({
	browser,
}) => {
	const title = `Offline note ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByLabel("Notes").fill("No signal in the basement");
	await save(tech);
	await expect(tech.locator(".badge")).toHaveText("Offline · 1 waiting");
	await expect(
		tech.getByRole("row").filter({ hasText: title }).getByLabel("Not synced"),
	).toBeVisible();

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await sync(office);
	await open(office, title);
	await expect(office.getByLabel("Notes")).toHaveValue(
		"No signal in the basement",
	);
});

test("two edits of the same field are settled and logged for the office", async ({
	browser,
}) => {
	const title = `Conflict ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByLabel("Status").selectOption({ label: "Done" });
	await save(tech);

	await open(office, title);
	await office.getByLabel("Status").selectOption({ label: "Cancelled" });
	await save(office);
	await expect(office.locator(".badge")).toHaveText("Synced");

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");

	// The later edit wins, on every device.
	await open(tech, title);
	await expect(tech.getByLabel("Status")).toHaveValue("cancelled");

	await office.goto("/#/conflicts");
	const entry = office.locator("li", { hasText: title });
	await expect(entry).toContainText("Kept Cancelled by Grâce Mabiala");
	await expect(entry).toContainText(`Overwritten Done by ${JUNIOR}`);
	await entry.getByRole("button", { name: "Mark reviewed" }).click();
	await expect(entry).toHaveCount(0);
});

test("an offline edit to an order reassigned meanwhile is refused and rolled back", async ({
	browser,
}) => {
	const title = `Reassigned ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByLabel("Notes").fill("Started the job");
	await save(tech);

	await open(office, title);
	await office.getByLabel("Assigned to").selectOption({ label: MERVEILLE });
	await save(office);

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await expect(tech.getByRole("link", { name: title })).toHaveCount(0);

	await tech.goto("/#/debug");
	await expect(tech.locator(".outbox li")).toContainText(["refused"]);
	await expect(tech.locator(".outbox li")).toContainText(["FORBIDDEN"]);
	await tech.getByRole("button", { name: "Clear 1 refused change" }).click();
	await expect(tech.getByText("Nothing waiting.")).toBeVisible();
});
