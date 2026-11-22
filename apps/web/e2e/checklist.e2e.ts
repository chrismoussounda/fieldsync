import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	open,
	section,
	setStatus,
	sync,
} from "./devices.ts";

test("the office sets the steps, the technician ticks them offline", async ({
	browser,
}) => {
	const title = `Checklist job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);

	await open(office, title);
	await office.getByRole("button", { name: "Add step" }).click();
	const sheet = office.getByRole("dialog");
	for (const step of ["Close the main valve", "Replace the seal"]) {
		await sheet.getByLabel("Step").fill(step);
		await sheet.getByRole("button", { name: "Add step" }).click();
	}
	await sheet.getByRole("button", { name: "Cancel" }).click();
	await expect(section(office, "Checklist")).toContainText("0 of 2 done");
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByText("Close the main valve").click();
	await expect(
		tech.getByRole("checkbox", { name: "Close the main valve" }),
	).toBeChecked();
	await expect(tech.getByRole("button", { name: /Remove/ })).toHaveCount(0);
	await setStatus(tech, "Done");
	await expect(tech.getByText("1 checklist step is not ticked.")).toBeVisible();

	await tech.context().setOffline(false);
	await expect(tech.locator(".badge")).toHaveText("Synced");
	await sync(office);
	await office.goto("/#/?status=all");
	await expect(
		office.getByRole("row").filter({ hasText: title }),
	).toContainText("1/2");
	await open(office, title);
	const checklist = section(office, "Checklist");
	await expect(checklist).toContainText("1 of 2 done");
	await expect(
		office.getByRole("checkbox", { name: "Close the main valve" }),
	).toBeChecked();
	await expect(checklist).toContainText(JUNIOR);
});
