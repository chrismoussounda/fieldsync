import { expect, type Page, test } from "@playwright/test";
import { device } from "./devices.ts";

const tabBar = (page: Page) =>
	page.getByRole("navigation", { name: "Main navigation" }).last();

test("a phone's tab bar keeps four tabs, the rest under More", async ({
	browser,
}) => {
	const office = await device(browser, "admin@fieldsync.demo");
	await office.setViewportSize({ width: 360, height: 780 });
	await expect(tabBar(office).getByRole("link")).toHaveText([
		"Work orders",
		"Schedule",
		"Map",
	]);

	await tabBar(office).getByRole("button", { name: "More" }).click();
	const more = office.getByRole("dialog");
	await expect(more.getByRole("link")).toHaveText([
		"Overview",
		"Sites",
		"Conflicts",
		"Team",
		"Devices",
		"Account",
	]);
	await expect(more.getByRole("button", { name: "Sign out" })).toBeVisible();
	await more.getByRole("link", { name: "Overview" }).click();
	await expect(more).toHaveCount(0);
	await expect(
		office.getByRole("heading", { level: 1, name: "Overview" }),
	).toBeVisible();
	// The page lives under More, so More is the current tab.
	await expect(
		tabBar(office).getByRole("button", { name: "More" }),
	).toHaveAttribute("aria-current", "page");
});

test("a technician's four pages all fit the tab bar", async ({ browser }) => {
	const tech = await device(browser, "junior@fieldsync.demo");
	await tech.setViewportSize({ width: 360, height: 780 });
	await expect(tabBar(tech).getByRole("link")).toHaveText([
		"Work orders",
		"Map",
		"Sites",
		"Account",
	]);
	await expect(tabBar(tech).getByRole("button", { name: "More" })).toHaveCount(
		0,
	);
});

test("the sync state sits in the top bar, on a desktop as on a phone", async ({
	browser,
}) => {
	const office = await device(browser, "dispatch@fieldsync.demo");
	for (const width of [1440, 390]) {
		await office.setViewportSize({ width, height: 844 });
		await expect(office.getByRole("banner").locator(".badge")).toHaveText(
			"Synced",
		);
	}
});

test("on a phone, the running clock stays in the bar with Stop", async ({
	browser,
}) => {
	const tech = await device(browser, "junior@fieldsync.demo");
	await tech.setViewportSize({ width: 390, height: 844 });
	await tech
		.getByRole("link", { name: "Inspect the generator" })
		.first()
		.click();
	await tech.getByRole("button", { name: "Start" }).click();
	const bar = tech.locator("[data-action-bar]");
	await expect(bar.getByText(/^\d+:\d{2}:\d{2}$/)).toBeInViewport();
	await bar.getByRole("button", { name: "Stop" }).click();
	await expect(bar.getByText(/^\d+:\d{2}:\d{2}$/)).toHaveCount(0);
	await expect(bar.getByRole("button", { name: "Start" })).toBeVisible();
});
