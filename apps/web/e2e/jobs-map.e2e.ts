import { type Browser, expect, type Page, test } from "@playwright/test";
import { device, JUNIOR, pick, saveSheet, sync } from "./devices.ts";

const DIRECTIONS =
	/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+,-?\d+\.\d+$/;

const pad = (n: number) => String(n).padStart(2, "0");
const today = new Date();
const tomorrow = new Date(
	today.getFullYear(),
	today.getMonth(),
	today.getDate() + 1,
);
/** Typed into the date segments: day, month, year. */
const typed = (d: Date) =>
	`${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;

/** A device whose maps never reach OpenStreetMap. */
async function mapDevice(browser: Browser, email: string): Promise<Page> {
	const page = await device(browser, email);
	await page.context().route(/tile\.openstreetmap\.org/, (r) => r.abort());
	return page;
}

const pin = (page: Page, title: string) =>
	page
		.getByRole("region", { name: "Map of the jobs" })
		.getByRole("button", { name: title, exact: true });
/** Chooses a pin from the keyboard: test jobs share a spot, so pins overlap. */
async function choose(page: Page, title: string) {
	await pin(page, title).focus();
	await page.keyboard.press("Enter");
}
const listed = (page: Page, title: string) =>
	page
		.getByRole("region", { name: /on the map$/ })
		.getByRole("button", { name: new RegExp(`^${title}`) });
const withoutPin = (page: Page) =>
	page.getByRole("region", { name: /without a pin$/ });

/** Files a job from the office, with a pin dropped on the map unless told not to. */
async function job(
	office: Page,
	title: string,
	{
		pinned = true,
		assignee,
		due,
	}: { pinned?: boolean; assignee?: string; due?: Date } = {},
): Promise<void> {
	await office.goto("/#/?new=1");
	const sheet = office.getByRole("dialog");
	await sheet.getByLabel("Title").fill(title);
	if (assignee) await pick(office, "Assigned to", assignee);
	if (due) {
		await sheet
			.getByRole("group", { name: "Due date" })
			.getByRole("spinbutton")
			.first()
			.click();
		await office.keyboard.type(typed(due));
	}
	if (pinned) {
		await sheet
			.getByRole("group", { name: "Position on the map" })
			.click({ position: { x: 160, y: 110 } });
		await expect(
			sheet.getByRole("button", { name: "Remove the pin" }),
		).toBeVisible();
	}
	await saveSheet(office);
	await expect(office.locator(".badge")).toHaveText("Synced");
}

test("the office finds a job by its pin, with the way there", async ({
	browser,
}) => {
	const title = `Valve ${Date.now()}`;
	const loose = `Leak ${Date.now()}`;
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await job(office, title);
	await job(office, loose, { pinned: false });

	await office.getByRole("link", { name: "Map" }).click();
	await expect(
		office.getByRole("heading", { level: 1, name: "Map" }),
	).toBeVisible();
	await expect(pin(office, title)).toBeVisible();
	await expect(pin(office, loose)).toHaveCount(0);
	// Without a pin, it is listed beside the map and leads to its page.
	await expect(
		withoutPin(office).getByRole("link", { name: loose }),
	).toBeVisible();

	await choose(office, title);
	const card = office.getByRole("region", { name: title });
	await expect(card).toBeVisible();
	await expect(card.getByRole("link", { name: "Directions" })).toHaveAttribute(
		"href",
		DIRECTIONS,
	);
	await expect(listed(office, title)).toHaveAttribute("aria-pressed", "true");
	await card.getByRole("button", { name: "Close" }).click();
	await expect(card).toHaveCount(0);

	// Picked from the list instead, then opened.
	await listed(office, title).click();
	await card.getByRole("link", { name: "Open the job" }).click();
	await expect(
		office.getByRole("heading", { level: 1, name: title }),
	).toBeVisible();
});

test("filters narrow the pins by status, technician and day", async ({
	browser,
}) => {
	const title = `Meter ${Date.now()}`;
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await job(office, title, { due: tomorrow });
	await office.goto("/#/map");
	await expect(pin(office, title)).toBeVisible();

	await office.getByRole("button", { name: "Technician" }).click();
	await office.getByRole("option", { name: JUNIOR, exact: true }).click();
	await expect(pin(office, title)).toHaveCount(0);
	await office.getByRole("button", { name: "Technician" }).click();
	await office.getByRole("option", { name: "Unassigned", exact: true }).click();
	await expect(pin(office, title)).toBeVisible();

	await office.getByRole("button", { name: "Status" }).click();
	await office.getByRole("option", { name: "Done", exact: true }).click();
	await expect(pin(office, title)).toHaveCount(0);
	await office.getByRole("button", { name: "Status" }).click();
	await office.getByRole("option", { name: "Open", exact: true }).click();
	await expect(pin(office, title)).toBeVisible();

	await office
		.getByRole("group", { name: "Day" })
		.getByRole("spinbutton")
		.first()
		.click();
	await office.keyboard.type(typed(today));
	await expect(pin(office, title)).toHaveCount(0);
	await office
		.getByRole("group", { name: "Day" })
		.getByRole("spinbutton")
		.first()
		.click();
	await office.keyboard.type(typed(tomorrow));
	await expect(pin(office, title)).toBeVisible();
});

test("a technician sees their own day, and the way to each job", async ({
	browser,
}) => {
	const now = `Panel ${Date.now()}`;
	const later = `Cable ${Date.now()}`;
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await job(office, now, { assignee: JUNIOR, due: today });
	await job(office, later, { assignee: JUNIOR, due: tomorrow });

	const tech = await mapDevice(browser, "junior@fieldsync.demo");
	await sync(tech);
	await tech.goto("/#/map");
	await expect(
		tech.getByText("Your jobs for the day.", { exact: false }),
	).toBeVisible();
	await expect(tech.getByRole("button", { name: "Technician" })).toHaveCount(0);
	await expect(pin(tech, now)).toBeVisible();
	await expect(pin(tech, later)).toHaveCount(0);

	await choose(tech, now);
	await expect(
		tech
			.getByRole("region", { name: now })
			.getByRole("link", { name: "Directions" }),
	).toHaveAttribute("href", DIRECTIONS);

	// Clearing the day shows the rest of the week's work.
	await tech.getByRole("button", { name: "Any date" }).click();
	await expect(pin(tech, later)).toBeVisible();
});

test("on a phone, filters fold into a drawer and the chosen job shows under the map", async ({
	browser,
}) => {
	const title = `Tap ${Date.now()}`;
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await job(office, title);
	await office.setViewportSize({ width: 390, height: 844 });
	await office
		.getByRole("navigation", { name: "Main navigation" })
		.last()
		.getByRole("link", { name: "Map" })
		.click();
	await expect(
		office.getByRole("region", { name: "Map of the jobs" }),
	).toBeVisible();
	await choose(office, title);
	const card = office.getByRole("region", { name: title });
	await expect(card.getByRole("link", { name: "Directions" })).toBeInViewport();

	// The filters wait behind a button, leaving the map the room.
	await expect(office.getByLabel("Status")).toHaveCount(0);
	await office.getByRole("button", { name: "Filters" }).click();
	await office
		.getByRole("dialog")
		.getByLabel("Status")
		.selectOption({ label: "Done" });
	await office.getByRole("button", { name: "Show results" }).click();
	await expect(office.getByRole("dialog")).toHaveCount(0);
	await expect(pin(office, title)).toHaveCount(0);
	await expect(office.getByRole("button", { name: "Filters 1" })).toBeVisible();
});
