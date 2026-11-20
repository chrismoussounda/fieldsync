import { expect, test } from "@playwright/test";
import { device, MERVEILLE } from "./devices.ts";

test("an admin locks a lost phone out", async ({ browser }) => {
	const admin = await device(browser, "admin@fieldsync.demo");
	const phone = await device(browser, "merveille@fieldsync.demo");

	await admin.getByRole("link", { name: "Devices" }).click();
	const mine = admin.locator("li", { hasText: "This device" });
	await expect(mine).toContainText("Ange Moukala");
	await expect(mine.getByRole("button", { name: "Revoke" })).toHaveCount(0);

	const lost = admin.locator("li", { hasText: MERVEILLE });
	await expect(lost).toContainText("Chrome on");
	await expect(lost).toContainText("Seen just now");
	await lost.getByRole("button", { name: "Revoke" }).click();
	await lost.getByRole("button", { name: "Revoke" }).click();
	await expect(lost).toContainText("Revoked");

	// Her next sync is refused, and the app locks at once.
	await phone.locator(".badge").click();
	await phone.getByRole("button", { name: "Sync now" }).click();
	await expect(
		phone.getByRole("heading", { name: "Device revoked" }),
	).toBeVisible();
});
