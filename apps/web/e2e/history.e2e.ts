import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	open,
	section,
	setStatus,
	sync,
} from "./devices.ts";

const OFFICE = "Grâce Mabiala";

test("an order's history shows who changed what, synced or not", async ({
	browser,
}) => {
	const title = `History ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	// Offline, his own edit is listed as waiting, above the office's.
	await tech.context().setOffline(true);
	await open(tech, title);
	await setStatus(tech, "In progress");
	const history = section(tech, "History").getByRole("listitem");
	await expect(history.first()).toContainText("Not synced yet");
	await expect(history.first()).toContainText(/Status\s*In progress/);

	// Online, it comes back from the server under his name.
	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await expect(history.first()).toContainText(JUNIOR);
	await expect(history.first()).not.toContainText("Not synced yet");

	await sync(office);
	await open(office, title);
	const entries = section(office, "History").getByRole("listitem");
	await expect(entries).toHaveCount(2);
	await expect(entries.nth(0)).toContainText(JUNIOR);
	await expect(entries.nth(0)).toContainText(/Status\s*In progress/);
	await expect(entries.nth(1)).toContainText(OFFICE);
	await expect(entries.nth(1)).toContainText(title);
	await expect(entries.nth(1)).toContainText(new RegExp(`Assignees*${JUNIOR}`));
});
