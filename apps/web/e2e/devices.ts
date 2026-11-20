import { type Browser, expect, type Page } from "@playwright/test";

export const JUNIOR = "Junior Nkounkou";
export const MERVEILLE = "Merveille Bouanga";

/** A signed-in device: its own browser context, so its own IndexedDB. */
export async function device(
	browser: Browser,
	email: string,
	password = process.env.DEMO_PASSWORD ?? "",
): Promise<Page> {
	const page = await (await browser.newContext()).newPage();
	await signIn(page, email, password);
	await expect(page.locator(".badge")).toHaveText("Synced");
	return page;
}

export async function signIn(
	page: Page,
	email: string,
	password: string,
): Promise<void> {
	await page.goto("/");
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
	await office.goto("/#/new");
	await office.getByLabel("Title").fill(title);
	await office.getByLabel("Assigned to").selectOption({ label: assignee });
	await office.getByRole("button", { name: "Save" }).click();
	await expect(office.locator(".badge")).toHaveText("Synced");
}

export async function open(page: Page, title: string): Promise<void> {
	await page.goto("/#/");
	await page.getByRole("link", { name: title }).click();
	await expect(page.getByLabel("Title")).toHaveValue(title);
}

export async function save(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Save" }).click();
	await expect(
		page.getByRole("heading", { name: "Work orders" }),
	).toBeVisible();
}
