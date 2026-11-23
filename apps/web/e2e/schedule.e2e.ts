import { expect, type Page, test } from "@playwright/test";
import {
	device,
	JUNIOR,
	MERVEILLE,
	open,
	pick,
	saveSheet,
	setStatus,
	statusOf,
	sync,
} from "./devices.ts";

// An office desktop; phones set their own size.
test.use({ viewport: { width: 1440, height: 900 } });

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) =>
	`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const longDay = (d: Date) =>
	new Intl.DateTimeFormat("en", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(d);

const today = new Date();
const cell = (page: Page, who: string, day = today) =>
	page.getByRole("cell", { name: `${who}, ${longDay(day)}` });
const job = (page: Page, title: string) =>
	page.locator("[data-job]").filter({ hasText: title });
/**
 * Drags a job from its middle, where its title link is, to the top of a
 * cell: a busy cell grows past the bottom of the window.
 */
async function drag(page: Page, title: string, to: ReturnType<typeof cell>) {
	// A card grabbed while the page settles is dropped beside its cell.
	const target = await to.elementHandle();
	await target?.waitForElementState("stable");
	await job(page, title).dragTo(to, { targetPosition: { x: 24, y: 24 } });
}
const toPlan = (page: Page) => page.getByRole("region", { name: /^To plan/ });

/** A job with neither technician nor date, waiting to be planned. */
async function unplanned(office: Page, title: string): Promise<void> {
	await office.goto("/#/?new=1");
	await office.getByRole("dialog").getByLabel("Title").fill(title);
	await saveSheet(office);
	await expect(office.locator(".badge")).toHaveText("Synced");
}

test("the office drags a job onto a technician's day, who gets it", async ({
	browser,
}) => {
	const title = `Boiler ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await unplanned(office, title);

	await office.goto("/#/schedule");
	await expect(toPlan(office).getByText(title)).toBeVisible();
	await drag(office, title, cell(office, JUNIOR));
	await expect(cell(office, JUNIOR).getByText(title)).toBeVisible();
	await expect(toPlan(office).getByText(title)).toHaveCount(0);
	await expect(office.getByText(`“${title}”: ${JUNIOR},`)).toBeVisible();

	// Dropping it where it already is changes nothing.
	await drag(office, title, cell(office, JUNIOR));
	await expect(office.getByText(`“${title}”: ${JUNIOR},`)).toHaveCount(1);

	await open(office, title);
	await expect(statusOf(office)).toHaveAccessibleName("Status: Assigned");

	await sync(tech);
	await expect(tech.getByRole("link", { name: title })).toBeVisible();
});

test("a move can be undone, and the sheet moves a job without dragging", async ({
	browser,
}) => {
	const title = `Fence ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await unplanned(office, title);
	await office.goto("/#/schedule");

	await drag(office, title, cell(office, "Unassigned"));
	await expect(cell(office, "Unassigned").getByText(title)).toBeVisible();
	await office.getByRole("button", { name: "Undo" }).click();
	await expect(toPlan(office).getByText(title)).toBeVisible();

	await office.getByRole("button", { name: `Move “${title}”` }).click();
	await pick(office, "Technician", MERVEILLE);
	await office
		.getByRole("dialog")
		.getByRole("button", { name: "Move", exact: true })
		.click();
	await expect(office.getByRole("dialog")).toHaveCount(0);
	// Still undated, so still to plan, now with Merveille.
	await expect(toPlan(office).getByText(title)).toBeVisible();
	await open(office, title);
	await expect(statusOf(office)).toHaveAccessibleName("Status: Assigned");
});

test("weeks page through, and finished jobs stay put", async ({ browser }) => {
	const title = `Pipes ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await unplanned(office, title);
	await office.goto("/#/schedule");
	await drag(office, title, cell(office, JUNIOR));
	await expect(cell(office, JUNIOR).getByText(title)).toBeVisible();

	const range = office.getByText(/\d{4}$/).first();
	const thisWeek = await range.textContent();
	await office.getByRole("button", { name: "Next week" }).click();
	await expect(range).not.toHaveText(thisWeek ?? "");
	await expect(job(office, title)).toHaveCount(0);
	await office.reload();
	await expect(range).not.toHaveText(thisWeek ?? "");
	await office.getByRole("button", { name: "Today" }).click();
	await expect(range).toHaveText(thisWeek ?? "");

	await open(office, title);
	await setStatus(office, "Done");
	await office.goto("/#/schedule");
	await expect(job(office, title)).toBeVisible();
	await expect(
		office.getByRole("button", { name: `Move “${title}”` }),
	).toHaveCount(0);
	await expect(job(office, title)).not.toHaveAttribute("draggable", "true");
});

test("technicians have no schedule", async ({ browser }) => {
	const tech = await device(browser, "junior@fieldsync.demo");
	await expect(tech.getByRole("link", { name: "Schedule" })).toHaveCount(0);
	await tech.goto("/#/schedule");
	await expect(tech).toHaveURL(/#\/$/);
});

test("on a phone, the schedule is one day, moved with the sheet", async ({
	browser,
}) => {
	const title = `Roof ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	await office.setViewportSize({ width: 390, height: 844 });
	await unplanned(office, title);
	await office.goto(`/#/schedule?day=${isoDay(today)}`);
	await expect(
		office.getByText(longDay(today), { exact: false }),
	).toBeVisible();

	await office.getByRole("button", { name: `Move “${title}”` }).click();
	const sheet = office.getByRole("dialog");
	await sheet.getByLabel("Technician").selectOption({ label: JUNIOR });
	await sheet.getByLabel("Day").fill(isoDay(today));
	await office
		.getByRole("dialog")
		.getByRole("button", { name: "Move", exact: true })
		.click();
	await expect(
		office.getByRole("region", { name: JUNIOR }).getByText(title),
	).toBeVisible();

	await office.getByRole("button", { name: "Next day" }).click();
	await expect(job(office, title)).toHaveCount(0);
});

test("two planners moving the same job, one offline, end up agreeing", async ({
	browser,
}) => {
	const title = `Pump ${Date.now()}`;
	const dispatch = await device(browser, "dispatch@fieldsync.demo");
	const admin = await device(browser, "admin@fieldsync.demo");
	await unplanned(dispatch, title);
	await sync(admin);
	await admin.goto("/#/schedule");

	await admin.context().setOffline(true);
	await drag(admin, title, cell(admin, JUNIOR));
	await expect(cell(admin, JUNIOR).getByText(title)).toBeVisible();

	await dispatch.goto("/#/schedule");
	await dispatch.getByRole("button", { name: `Move “${title}”` }).click();
	await pick(dispatch, "Technician", MERVEILLE);
	// Typed into the date segments: day, month, year.
	await dispatch.getByRole("dialog").getByRole("spinbutton").first().click();
	await dispatch.keyboard.type(
		`${pad(today.getDate())}${pad(today.getMonth() + 1)}${today.getFullYear()}`,
	);
	await dispatch
		.getByRole("dialog")
		.getByRole("button", { name: "Move", exact: true })
		.click();
	await expect(cell(dispatch, MERVEILLE).getByText(title)).toBeVisible();
	await expect(dispatch.locator(".badge")).toHaveText("Synced");

	await admin.context().setOffline(false);
	await expect(admin.locator(".badge")).toHaveText("Synced");
	// The later move wins on both screens.
	await expect(cell(admin, MERVEILLE).getByText(title)).toBeVisible();
	await expect(cell(admin, JUNIOR).getByText(title)).toHaveCount(0);
	await dispatch.reload();
	await expect(cell(dispatch, MERVEILLE).getByText(title)).toBeVisible();

	// Only the assignee differed: the day and the status both chose agree.
	await dispatch.goto("/#/conflicts");
	const clash = dispatch.getByRole("row").filter({ hasText: title });
	await expect(clash).toHaveCount(1);
	await expect(clash).toContainText(`Assignee${MERVEILLE}${JUNIOR}`);
});
