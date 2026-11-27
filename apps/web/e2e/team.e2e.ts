import { expect, test } from "@playwright/test";
import { blankDevice, device, signIn } from "./devices.ts";

const EMAIL = "ines@fieldsync.demo";
const FIRST = "first password for Ines";
const OWN = "Ines picked this one";

test("an admin adds a technician, who later gets disabled", async ({
	browser,
}) => {
	const admin = await device(browser, "admin@fieldsync.demo");
	await admin.getByRole("link", { name: "Team" }).click();
	await admin.getByRole("button", { name: "Add someone" }).click();
	await admin.getByLabel("Name").fill("Ines Mabiala");
	await admin.getByLabel("Email").fill(EMAIL);
	await admin.getByLabel("First password").fill(FIRST);
	await admin.getByRole("button", { name: "Add", exact: true }).click();
	const ines = admin.getByRole("row").filter({ hasText: "Ines Mabiala" });
	await expect(ines).toContainText(EMAIL);
	await expect(ines).toContainText("Technician");

	// She can be assigned work right away.
	await admin.goto("/#/?new=1");
	await admin
		.getByRole("dialog")
		.getByRole("button", { name: "Assigned to" })
		.click();
	await expect(
		admin.getByRole("option", { name: "Ines Mabiala" }),
	).toBeVisible();
	await admin.keyboard.press("Escape");

	// She signs in and replaces the password the admin gave her.
	const phone = await device(browser, EMAIL, FIRST);
	await phone.getByRole("link", { name: /Ines Mabiala/ }).click();
	await phone.getByLabel("Current password").fill("not her password");
	await phone.getByLabel("New password").fill(OWN);
	await phone.getByLabel("Type it again").fill(OWN);
	await phone.getByRole("button", { name: "Change password" }).click();
	await expect(phone.getByRole("alert")).toHaveText(
		"The current password is incorrect.",
	);
	await phone.getByLabel("Current password").fill(FIRST);
	await phone.getByLabel("New password").fill(OWN);
	await phone.getByLabel("Type it again").fill(OWN);
	await phone.getByRole("button", { name: "Change password" }).click();
	await expect(phone.getByRole("status")).toHaveText("Password changed.");

	// The admin disables her account: her phone locks on its next sync.
	await admin.goto("/#/team");
	const actions = ines.getByRole("button", {
		name: "Actions for Ines Mabiala",
	});
	await actions.click();
	await admin.getByRole("menuitem", { name: "Disable" }).click();
	await admin
		.getByRole("alertdialog")
		.getByRole("button", { name: "Disable" })
		.click();
	await expect(ines).toContainText("Disabled");
	await actions.click();
	await expect(admin.getByRole("menuitem", { name: "Enable" })).toBeVisible();
	await admin.keyboard.press("Escape");

	await expect(
		phone.getByRole("heading", { name: "Device revoked" }),
	).toBeVisible({ timeout: 20_000 });

	// A new device is refused too, with the reason.
	const other = await blankDevice(browser);
	await signIn(other, EMAIL, OWN);
	await expect(other.getByRole("alert")).toHaveText(
		"This account has been disabled. Ask an admin to enable it again.",
	);
});
