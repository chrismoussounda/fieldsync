import { useState } from "react";
import { useTranslation } from "react-i18next";
import { messageFor } from "./errors.ts";

/** Runs a sign-in, with what to show while it runs and if it fails. */
export function useSignIn() {
	const { t } = useTranslation();
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function attempt(signIn: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await signIn();
		} catch (e) {
			setError(
				messageFor(e, {
					UNAUTHORIZED: t("login.UNAUTHORIZED"),
					ACCOUNT_DISABLED: t("login.ACCOUNT_DISABLED"),
					DEVICE_REVOKED: t("login.DEVICE_REVOKED"),
					DEVICE_TAKEN: t("login.DEVICE_TAKEN"),
					NOT_FOUND: t("login.noDemo"),
				}),
			);
		} finally {
			setBusy(false);
		}
	}

	return { error, busy, attempt };
}
