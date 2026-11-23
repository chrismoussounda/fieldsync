import { expect, test } from "@playwright/test";

test("speaks French first, then keeps the chosen language and theme", async ({
	browser,
}) => {
	const page = await (await browser.newContext()).newPage();
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("lang", "fr");
	await expect(
		page.getByRole("heading", {
			name: "Les interventions terrain, même sans réseau.",
		}),
	).toBeVisible();
	await page.getByRole("link", { name: "Se connecter" }).click();
	await page.getByRole("button", { name: "J'ai un compte" }).click();
	await page.getByLabel("E-mail").fill("junior@fieldsync.demo");
	await page.getByLabel("Mot de passe").fill(process.env.DEMO_PASSWORD ?? "");
	await page.getByRole("button", { name: "Se connecter" }).click();
	await expect(page.locator(".badge")).toHaveText("Synchronisé");

	await page
		.locator("aside")
		.getByRole("link", { name: /Junior Nkounkou/ })
		.click();
	await page.getByRole("radio", { name: "English" }).click();
	await expect(page.getByRole("link", { name: "Work orders" })).toBeVisible();
	await page.getByRole("radio", { name: "Dark" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);

	await page.reload();
	await expect(page.locator(".badge")).toHaveText("Synced");
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.locator("html")).toHaveClass(/dark/);
});
