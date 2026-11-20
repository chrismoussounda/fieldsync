import { expect, test } from "@playwright/test";
import { device } from "./devices.ts";

test("opens with no network once it has been loaded", async ({ browser }) => {
	const tech = await device(browser, "junior@fieldsync.demo");
	await tech.waitForFunction(() => navigator.serviceWorker.controller !== null);

	await tech.context().setOffline(true);
	await tech.reload();
	await expect(
		tech.getByRole("heading", { name: "Work orders" }),
	).toBeVisible();
	await expect(
		tech.getByRole("link", { name: /Replace the water pump/ }),
	).toBeVisible();
	await expect(tech.locator(".badge")).toHaveText("Offline");
});
