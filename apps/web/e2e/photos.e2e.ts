import { expect, type Page, test } from "@playwright/test";
import { createOrder, device, JUNIOR, open, sync } from "./devices.ts";

// A real 1x1 PNG, enough for the browser to decode and shrink.
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

// The image arrives after the record, so wait for it to show for real.
const decoded = (page: Page, name: string) =>
	expect
		.poll(() =>
			page
				.getByRole("img", { name })
				.evaluate((img: HTMLImageElement) => img.naturalWidth)
				.catch(() => 0),
		)
		.toBe(1);

test("a photo taken offline reaches the office once back online", async ({
	browser,
}) => {
	const title = `Photo job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByLabel("Caption").fill("Leaking valve");
	await tech.getByLabel("Add photo").setInputFiles({
		name: "valve.png",
		mimeType: "image/png",
		buffer: PNG,
	});
	const photos = tech.locator(".photos");
	await expect(
		photos.getByRole("img", { name: "Leaking valve" }),
	).toBeVisible();
	await expect(photos).toContainText("Not synced");

	await tech.context().setOffline(false);
	await expect(photos).not.toContainText("Not synced", { timeout: 20_000 });

	await sync(office);
	await open(office, title);
	await expect(office.locator(".photos")).toContainText("Leaking valve");
	await decoded(office, "Leaking valve");

	await office.getByRole("button", { name: "Leaking valve" }).click();
	const viewer = office.getByRole("dialog", { name: "Leaking valve" });
	await expect(viewer).toContainText(`by ${JUNIOR}`);
	await viewer.getByRole("button", { name: "Delete photo" }).click();
	await expect(office.locator(".photos")).toContainText("No photos yet.");
});
