import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createOrder, device, JUNIOR, sync } from "./devices.ts";
import { API_DIR } from "./setup.ts";

test("a signed-in device starts over after the nightly demo reset", async ({
	browser,
}) => {
	const title = `Before the reset ${Date.now()}`;
	const office = await device(browser, "dispatch@fieldsync.demo");
	const tech = await device(browser, "junior@fieldsync.demo");
	await createOrder(office, title, JUNIOR);
	await sync(tech);
	await expect(tech.getByRole("link", { name: title })).toBeVisible();

	execFileSync("node", ["src/reset-demo.ts"], {
		cwd: API_DIR,
		env: process.env,
	});

	await sync(tech);
	await expect(tech.getByRole("link", { name: title })).toHaveCount(0);
	await expect(
		tech.getByRole("link", { name: /Replace the water pump/ }),
	).toHaveCount(1);
});
