import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	open,
	scribble,
	section,
	sync,
} from "./devices.ts";

test("the customer signs on the technician's phone, offline", async ({
	browser,
}) => {
	const title = `Signed job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);

	await tech.context().setOffline(true);
	await open(tech, title);
	await tech
		.getByRole("button", { name: "Get the customer's signature" })
		.click();
	const save = tech.getByRole("button", { name: "Save signature" });
	await tech.getByLabel("Customer name").fill("Mr Kaya");
	await expect(save).toBeDisabled();
	await scribble(tech);
	await save.click();
	const signature = section(tech, "Customer signature");
	await expect(signature).toContainText("Signed by Mr Kaya");
	await expect(signature).toContainText("Not synced");

	await tech.context().setOffline(false);
	await expect(signature).not.toContainText("Not synced", { timeout: 20_000 });

	await sync(office);
	await open(office, title);
	const signed = section(office, "Customer signature");
	await expect(signed).toContainText("Signed by Mr Kaya");
	await expect(signed).toContainText(`collected by ${JUNIOR}`);
	await expect
		.poll(() =>
			office
				.getByRole("img", { name: "Signed by Mr Kaya" })
				.evaluate((img: HTMLImageElement) => img.naturalWidth)
				.catch(() => 0),
		)
		.toBe(600);
	await expect(section(office, "Photos")).toContainText("No photos yet.");
});
