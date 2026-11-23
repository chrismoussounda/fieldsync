import { type Browser, expect, type Page, test } from "@playwright/test";
import { blankDevice, JUNIOR, open, saveSheet, sync } from "./devices.ts";

/** A visitor's own demo, so each test is alone in its own. */
async function start(browser: Browser, name: RegExp): Promise<Page> {
	const page = await blankDevice(browser);
	await page.goto("/#/login");
	await page.getByRole("button", { name }).click();
	await expect(page.locator(".badge")).toHaveText("Synced");
	return page;
}

async function openDemo(page: Page) {
	await page.getByRole("button", { name: "Demo", exact: true }).click();
	return page.getByRole("dialog", { name: "Your demo" });
}

/** Opens the same demo on another device, from the copied link. */
async function join(browser: Browser, from: Page, name: RegExp): Promise<Page> {
	await from.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	const sheet = await openDemo(from);
	await sheet.getByRole("button", { name: "Copy the link" }).click();
	await expect(from.getByText("Link copied")).toBeVisible();
	const link = await from.evaluate(() => navigator.clipboard.readText());
	await from.keyboard.press("Escape");
	await expect(sheet).toHaveCount(0);

	const other = await blankDevice(browser);
	await other.goto(link);
	await other.getByRole("button", { name }).click();
	await expect(other.locator(".badge")).toHaveText("Synced");
	return other;
}

async function create(page: Page, title: string) {
	await page.goto("/#/?new=1");
	await page.getByRole("dialog").getByLabel("Title").fill(title);
	await saveSheet(page);
	await expect(page.locator(".badge")).toHaveText("Synced");
}

test("a visitor tries the demo from the landing or the sign-in page, without a password", async ({
	browser,
}) => {
	const tech = await start(browser, /Junior/);
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

test("each visitor has their own demo", async ({ browser }) => {
	const title = `Mine ${Date.now()}`;
	const mine = await start(browser, /Grâce/);
	await create(mine, title);
	await expect(mine.getByRole("link", { name: title })).toBeVisible();
	const theirs = await start(browser, /Grâce/);
	await expect(
		theirs.getByText("Fix the cold room door").first(),
	).toBeVisible();
	await expect(theirs.getByText(title)).toHaveCount(0);
});

test("a visitor becomes someone else in the same demo, keeping their work", async ({
	browser,
}) => {
	const title = `Shared ${Date.now()}`;
	const page = await start(browser, /Grâce/);
	await create(page, title);
	await page.goto("/#/schedule");

	const sheet = await openDemo(page);
	await expect(sheet.getByRole("button", { name: /Grâce/ })).toBeDisabled();
	await sheet.getByRole("button", { name: /Ange/ }).click();
	await expect(page.getByRole("link", { name: "Devices" })).toBeVisible();
	await expect(page.getByRole("link", { name: title })).toBeVisible();

	await (await openDemo(page)).getByRole("button", { name: /Junior/ }).click();
	await expect(page.getByRole("link", { name: "Schedule" })).toHaveCount(0);
	await expect(page.getByText("Replace the water pump").first()).toBeVisible();
	// Assigned to nobody, so not on a technician's device.
	await expect(page.getByText(title)).toHaveCount(0);
	await expect(page.getByText("Fix the cold room door")).toHaveCount(0);
});

test("a change waiting offline is neither lost nor carried to someone else", async ({
	browser,
}) => {
	const title = `Waiting ${Date.now()}`;
	const page = await start(browser, /Grâce/);
	await page.context().setOffline(true);
	await page.goto("/#/?new=1");
	await page.getByRole("dialog").getByLabel("Title").fill(title);
	await saveSheet(page);

	await (await openDemo(page)).getByRole("button", { name: /Ange/ }).click();
	const confirm = page.getByRole("alertdialog");
	await expect(confirm).toContainText("1 change");
	await confirm.getByRole("button", { name: "Switch anyway" }).click();
	// No network to switch with: still Grâce, with the change still waiting.
	await expect(page.getByText("No connection", { exact: false })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.context().setOffline(false);
	await expect(page.locator(".badge")).toHaveText("Synced", {
		timeout: 20_000,
	});
	await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("the same demo on two devices: work arrives, and a lost phone is locked out", async ({
	browser,
}) => {
	const office = await start(browser, /Ange/);
	const phone = await join(browser, office, /Junior/);
	await open(phone, "Replace the water pump");
	await phone.getByRole("button", { name: /^Status/ }).click();
	await phone.getByRole("menuitemradio", { name: "Done" }).click();
	await expect(phone.locator(".badge")).toHaveText("Synced");
	await sync(office);
	await open(office, "Replace the water pump");
	await expect(
		office.getByRole("button", { name: "Status: Done" }),
	).toBeVisible();

	// A link opened where someone is signed in does not throw them out.
	const hash = await office.evaluate(() => window.location.hash);
	await office.goto("/#/demo/another");
	await expect(
		office.getByText("already signed in here", { exact: false }),
	).toBeVisible();
	await office.goto(`/${hash}`);

	await office.goto("/#/devices");
	await office
		.getByRole("button", { name: /Junior/ })
		.first()
		.click();
	await office
		.getByRole("alertdialog")
		.getByRole("button", { name: "Revoke" })
		.click();
	await expect(office.getByText("Device revoked.")).toBeVisible();
	await phone.reload();
	await expect(
		phone.getByRole("heading", { name: "Device revoked" }),
	).toBeVisible();
});

test("a link to a demo that is over says so", async ({ browser }) => {
	const page = await blankDevice(browser);
	await page.goto("/#/demo/gone");
	await page.getByRole("button", { name: /Junior/ }).click();
	await expect(page.getByRole("alert")).toContainText("This demo has ended");
	await page.getByRole("link", { name: "Go to the home page" }).click();
	await expect(
		page.getByRole("button", { name: "As the office" }).first(),
	).toBeVisible();
});
