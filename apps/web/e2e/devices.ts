import {
	type Browser,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import { WEB_PORT } from "../playwright.config.ts";

export const JUNIOR = "Junior Nkounkou";
export const MERVEILLE = "Merveille Bouanga";

/** A fresh browser with its own IndexedDB; English unless told otherwise. */
export async function blankDevice(browser: Browser, language = "en") {
	const context = await browser.newContext({
		storageState: {
			cookies: [],
			origins: [
				{
					origin: `http://localhost:${WEB_PORT}`,
					localStorage: [{ name: "fieldsync.language", value: language }],
				},
			],
		},
	});
	return context.newPage();
}

/** A signed-in device. */
export async function device(
	browser: Browser,
	email: string,
	password = process.env.DEMO_PASSWORD ?? "",
): Promise<Page> {
	const page = await blankDevice(browser);
	await signIn(page, email, password);
	await expect(page.locator(".badge")).toHaveText("Synced");
	return page;
}

export async function signIn(
	page: Page,
	email: string,
	password: string,
): Promise<void> {
	await page.goto("/#/login");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
}

/** Reloading syncs at once instead of waiting for the next tick. */
export async function sync(page: Page): Promise<void> {
	await page.reload();
	await expect(page.locator(".badge")).toHaveText("Synced");
}

export async function createOrder(
	office: Page,
	title: string,
	assignee: string,
): Promise<void> {
	await office.goto("/#/?new=1");
	await office.getByRole("dialog").getByLabel("Title").fill(title);
	await pick(office, "Assigned to", assignee);
	await saveSheet(office);
	await expect(office.locator(".badge")).toHaveText("Synced");
}

/** Picks an option in a custom select of the open sheet, found by its label. */
export async function pick(
	page: Page,
	label: string,
	option: string,
): Promise<void> {
	await page.getByRole("dialog").getByRole("button", { name: label }).click();
	await page.getByRole("option", { name: option, exact: true }).click();
}

/** Saves the open sheet and waits for it to close. */
export async function saveSheet(page: Page): Promise<void> {
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Save", exact: true })
		.click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Opens an order from the list, finished or not. */
export async function open(page: Page, title: string): Promise<void> {
	await page.goto("/#/?status=all");
	await page.getByRole("link", { name: title }).click();
	await expect(
		page.getByRole("heading", { level: 1, name: title }),
	).toBeVisible();
}

/** Opens the order's edit sheet. */
export async function edit(page: Page): Promise<Locator> {
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	return page.getByRole("dialog");
}

/** Changes the status from the order page's header. */
export async function setStatus(page: Page, status: string): Promise<void> {
	await statusOf(page).click();
	await page.getByRole("menuitemradio", { name: status }).click();
	await expect(statusOf(page)).toHaveAccessibleName(`Status: ${status}`);
}

export const statusOf = (page: Page) =>
	page.getByRole("button", { name: /^Status: / });

/** A titled card of the order page, like "Checklist" or "Notes". */
export const section = (page: Page, title: string) =>
	page.getByRole("region", { name: title, exact: true });

/** Draws a signature on the pad. */
export async function scribble(page: Page) {
	const box = await page.getByLabel("Signature pad").boundingBox();
	if (!box) throw new Error("No signature pad");
	await page.mouse.move(box.x + 20, box.y + box.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) {
		await page.mouse.move(
			box.x + 20 + i * 25,
			box.y + box.height / 2 + (i % 2 ? -20 : 20),
		);
	}
	await page.mouse.up();
}
