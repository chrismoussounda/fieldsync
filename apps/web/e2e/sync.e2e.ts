import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	edit,
	JUNIOR,
	MERVEILLE,
	open,
	pick,
	saveSheet,
	section,
	setStatus,
	statusOf,
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
	await (await edit(tech))
		.getByLabel("Notes")
		.fill("No signal in the basement");
	await saveSheet(tech);
	await expect(tech.locator(".badge")).toHaveText("Offline · 1 waiting");
	await tech.goto("/#/?status=all");
	await expect(
		tech.getByRole("row").filter({ hasText: title }).getByLabel("Not synced"),
	).toBeVisible();

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await sync(office);
	await open(office, title);
	await expect(section(office, "Notes")).toContainText(
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
	await setStatus(tech, "Done");

	await open(office, title);
	await setStatus(office, "Cancelled");
	await expect(office.locator(".badge")).toHaveText("Synced");

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");

	// The later edit wins, on every device.
	await open(tech, title);
	await expect(statusOf(tech)).toHaveAccessibleName("Status: Cancelled");

	await office.goto("/#/conflicts");
	const entry = office.getByRole("row").filter({ hasText: title });
	await entry.click();
	const sheet = office.getByRole("dialog");
	await expect(sheet).toContainText(/Kept\s*Cancelled\s*by Grâce Mabiala/);
	await expect(sheet).toContainText(
		new RegExp(`Overwritten\\s*Done\\s*by ${JUNIOR}`),
	);
	await sheet.getByRole("button", { name: "Mark reviewed" }).click();
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
	await (await edit(tech)).getByLabel("Notes").fill("Started the job");
	await saveSheet(tech);

	await open(office, title);
	await edit(office);
	await pick(office, "Assigned to", MERVEILLE);
	await saveSheet(office);

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await expect(tech.getByRole("link", { name: title })).toHaveCount(0);

	await tech.goto("/#/debug");
	// Raw engine values stay out of the way until support asks for them.
	await expect(tech.getByText("Device ID")).toHaveCount(0);
	await tech
		.getByRole("button", { name: "Technical details (for support)" })
		.click();
	await expect(tech.getByText("Device ID")).toBeVisible();
	const refused = tech.locator(".outbox li");
	await expect(refused).toContainText("Refused");
	// The order left this phone with the reassignment; the change says so.
	await expect(refused).toContainText(
		"A job no longer on this device: notes changed",
	);
	await expect(refused).toContainText("no longer allowed");
	await tech.getByRole("button", { name: "Clear 1 refused change" }).click();
	await expect(tech.getByText("Everything is sent.")).toBeVisible();
});
