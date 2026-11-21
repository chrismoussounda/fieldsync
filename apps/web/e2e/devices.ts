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
	await office.getByRole("button", { name: "Save", exact: true }).click();
	await expect(office.locator(".badge")).toHaveText("Synced");
}

/** Opens an order from the list, finished or not. */
export async function open(page: Page, title: string): Promise<void> {
	await page.goto("/#/?status=all");
	await page.getByRole("link", { name: title }).click();
	await expect(page.getByLabel("Title")).toHaveValue(title);
}

export async function save(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Work orders" }),
	).toBeVisible();
}

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
