import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	open,
	save,
	scribble,
	sync,
} from "./devices.ts";

test("the technician hands the customer a report, offline", async ({
	browser,
}) => {
	const title = `Reported job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await open(office, title);
	await office.getByLabel("New step").fill("Close the main valve");
	await office.getByRole("button", { name: "Add step" }).click();
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(tech);
	await tech.context().setOffline(true);
	await open(tech, title);
	await tech.getByRole("checkbox", { name: "Close the main valve" }).check();
	await tech.getByLabel("Customer name").fill("Mme Okemba");
	await scribble(tech);
	await tech.getByRole("button", { name: "Save signature" }).click();
	await tech
		.getByLabel("Notes")
		.fill("Replaced the seal; no leak after an hour.");
	await save(tech);

	await open(tech, title);
	await tech.getByRole("link", { name: "Job report" }).click();
	const report = tech.locator(".report");
	await expect(report.getByRole("heading", { name: title })).toBeVisible();
	await expect(report).toContainText(
		"Replaced the seal; no leak after an hour.",
	);
	await expect(report).toContainText("☑ Close the main valve");
	await expect(report).toContainText(JUNIOR);
	await expect(report.getByRole("img", { name: "Signature" })).toBeVisible();
	await expect(report).toContainText("Mme Okemba");

	await tech.emulateMedia({ media: "print" });
	await expect(tech.locator("aside")).toBeHidden();
	await expect(
		tech.getByRole("button", { name: "Print or save as PDF" }),
	).toBeHidden();
	await expect(report).toBeVisible();
});
