import { expect, test } from "@playwright/test";
import {
	createOrder,
	device,
	JUNIOR,
	MERVEILLE,
	open,
	save,
	sync,
} from "./devices.ts";

test("a technician's phone holds only his orders, and follows reassignments", async ({
	browser,
}) => {
	const title = `Moving job ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const junior = await device(browser, "junior@fieldsync.demo");
	const merveille = await device(browser, "merveille@fieldsync.demo");
	await createOrder(office, title, JUNIOR);

	// Even with every filter off, Merveille's phone does not have it.
	await sync(junior);
	await sync(merveille);
	const all = "/#/?status=all&assignee=all";
	await junior.goto(all);
	await expect(junior.getByRole("link", { name: title })).toBeVisible();
	await merveille.goto(all);
	await expect(merveille.getByRole("link", { name: title })).toHaveCount(0);
	await expect(
		merveille.getByRole("link", { name: /Replace the water pump/ }),
	).toHaveCount(0);

	// Reassigned: it leaves his phone and arrives on hers, history included.
	await open(office, title);
	await office.getByLabel("Notes").fill("Bring the long ladder");
	await office.getByLabel("Assigned to").selectOption({ label: MERVEILLE });
	await save(office);
	await expect(office.locator(".badge")).toHaveText("Synced");

	await sync(junior);
	await junior.goto(all);
	await expect(junior.getByRole("link", { name: title })).toHaveCount(0);
	await sync(merveille);
	await open(merveille, title);
	await expect(merveille.getByLabel("Notes")).toHaveValue(
		"Bring the long ladder",
	);
});
