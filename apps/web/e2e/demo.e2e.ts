import { expect, test } from "@playwright/test";
import { blankDevice, JUNIOR } from "./devices.ts";

test("a visitor tries the demo from the landing or the sign-in page, without a password", async ({
	browser,
}) => {
	const tech = await blankDevice(browser);
	await tech.goto("/#/login");
	await tech.getByRole("button", { name: "As a technician" }).click();
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await expect(
		tech.getByRole("heading", { level: 1, name: "Work orders" }),
	).toBeVisible();
	// A technician sees only their own jobs.
	await expect(tech.getByText("Replace the water pump").first()).toBeVisible();
	await expect(tech.getByText("Fix the cold room door")).toHaveCount(0);
	await tech.goto("/#/account");
	await expect(tech.getByText(JUNIOR, { exact: false }).first()).toBeVisible();

	const office = await blankDevice(browser);
	await office.goto("/");
	await office.getByRole("button", { name: "As the office" }).first().click();
	await expect(
		office.getByRole("link", { name: "Schedule" }).first(),
	).toBeVisible();
	await expect(
		office.getByText("Fix the cold room door").first(),
	).toBeVisible();
});
