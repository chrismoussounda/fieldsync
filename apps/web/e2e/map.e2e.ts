import { type Browser, expect, type Page, test } from "@playwright/test";
import {
	device,
	edit,
	JUNIOR,
	open,
	pick,
	saveSheet,
	section,
	sync,
} from "./devices.ts";

const COORDS = /^-?\d+\.\d{5}, -?\d+\.\d{5}$/;
const DIRECTIONS =
	/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+,-?\d+\.\d+$/;

/** A device whose maps never reach OpenStreetMap: the tests stay offline-safe and fast. */
async function mapDevice(browser: Browser, email: string): Promise<Page> {
	const page = await device(browser, email);
	await page.context().route(/tile\.openstreetmap\.org/, (r) => r.abort());
	return page;
}

const picker = (page: Page) =>
	page.getByRole("dialog").getByRole("group", { name: "Position on the map" });

/** Drops the pin by tapping the map at a point inside it. */
async function dropPin(page: Page, x = 160, y = 110): Promise<string> {
	await picker(page).click({ position: { x, y } });
	const shown = page.getByRole("dialog").getByText(COORDS);
	await expect(shown).toBeVisible();
	return (await shown.textContent()) ?? "";
}

test("the pin, not the address, leads the directions to a site and its jobs", async ({
	browser,
}) => {
	const name = `Depot ${Date.now()}`;
	const title = `Gate at ${name}`;
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	const tech = await mapDevice(browser, "junior@fieldsync.demo");

	// With an address but no pin, there is nowhere precise to drive to.
	await office.goto("/#/sites?new=1");
	await office.getByLabel("Name").fill(name);
	await office.getByLabel("Address").fill("Quartier Mpila, Brazzaville");
	await expect(
		office.getByText("Tap the map to drop the pin", { exact: true }),
	).toBeVisible();
	await expect(
		office.getByRole("button", { name: "Remove the pin" }),
	).toHaveCount(0);
	await saveSheet(office);
	await office.getByRole("link", { name }).click();
	await expect(office.getByRole("heading", { name })).toBeVisible();
	await expect(office.getByRole("link", { name: "Directions" })).toHaveCount(0);
	await expect(office.getByText("No pin on the map yet")).toBeVisible();

	// A tap drops the pin; a second tap moves it.
	await edit(office);
	const first = await dropPin(office, 120, 90);
	const point = await dropPin(office, 200, 140);
	expect(point).not.toBe(first);
	await saveSheet(office);
	await expect(office.getByRole("img", { name: `Map: ${name}` })).toBeVisible();
	const directions = office.getByRole("link", { name: "Directions" });
	await expect(directions).toHaveAttribute("href", DIRECTIONS);
	const href = await directions.getAttribute("href");
	// The link carries the full point; the sheet showed it to 5 decimals.
	const [lat, lng] = (href?.split("destination=")[1] ?? "")
		.split(",")
		.map(Number);
	const [shownLat, shownLng] = point.split(", ").map(Number);
	expect(lat).toBeCloseTo(shownLat ?? Number.NaN, 5);
	expect(lng).toBeCloseTo(shownLng ?? Number.NaN, 5);

	// An order filed at the site takes its pin.
	await office.goto("/#/?new=1");
	await office.getByRole("dialog").getByLabel("Title").fill(title);
	await pick(office, "Site", name);
	await expect(office.getByRole("dialog").getByText(point)).toBeVisible();
	await pick(office, "Assigned to", JUNIOR);
	await saveSheet(office);
	await expect(office.locator(".badge")).toHaveText("Synced");
	await open(office, title);
	await expect(
		section(office, "Site").getByRole("link", { name: "Directions" }),
	).toHaveAttribute("href", href ?? "");

	// The technician gets the same directions, even offline, but cannot move the pin.
	await sync(tech);
	await tech.context().setOffline(true);
	await open(tech, title);
	await expect(
		section(tech, "Site").getByRole("link", { name: "Directions" }),
	).toHaveAttribute("href", href ?? "");
	const sheet = await edit(tech);
	await expect(
		sheet.getByRole("group", { name: "Position on the map" }),
	).toHaveCount(0);
	await tech.keyboard.press("Escape");
	await tech.context().setOffline(false);

	// Removing the pin takes the directions away again.
	await office.goto("/#/sites");
	await office.getByRole("link", { name }).click();
	await edit(office);
	await office.getByRole("button", { name: "Remove the pin" }).click();
	await expect(office.getByRole("dialog").getByText(COORDS)).toHaveCount(0);
	await saveSheet(office);
	await expect(office.getByRole("link", { name: "Directions" })).toHaveCount(0);
	await expect(office.getByText("No pin on the map yet")).toBeVisible();
});

test("on a phone, dragging across the map leaves the drawer open", async ({
	browser,
}) => {
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await office.setViewportSize({ width: 390, height: 844 });
	await office.goto("/#/sites?new=1");
	const map = picker(office);
	await map.scrollIntoViewIfNeeded();
	const box = await map.boundingBox();
	if (!box) throw new Error("map not laid out");
	await office.mouse.move(box.x + box.width / 2, box.y + 40);
	await office.mouse.down();
	await office.mouse.move(box.x + box.width / 2, box.y + box.height - 10, {
		steps: 10,
	});
	await office.mouse.up();
	await expect(office.getByRole("dialog")).toBeVisible();
	await expect(map).toBeVisible();
});

test("my position drops the pin where the device is, and says so when refused", async ({
	browser,
}) => {
	const office = await mapDevice(browser, "dispatch@fieldsync.demo");
	await office.context().grantPermissions(["geolocation"]);
	await office
		.context()
		.setGeolocation({ latitude: -4.2668, longitude: 15.2829 });
	await office.goto("/#/sites?new=1");
	await office.getByRole("button", { name: "My position" }).click();
	await expect(
		office.getByRole("dialog").getByText("-4.26680, 15.28290"),
	).toBeVisible();

	const refused = await mapDevice(browser, "dispatch@fieldsync.demo");
	await refused.context().clearPermissions();
	await refused.goto("/#/sites?new=1");
	await refused.getByRole("button", { name: "My position" }).click();
	await expect(refused.getByText("Could not get your position.")).toBeVisible();
	await expect(refused.getByRole("dialog").getByText(COORDS)).toHaveCount(0);
});
