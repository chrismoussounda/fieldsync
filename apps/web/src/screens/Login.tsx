import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messageFor } from "../app/errors.ts";
import type { Session } from "../auth/session.ts";
import { Logo } from "./Logo.tsx";

export function Login({ session }: { session: Session }) {
	const { t } = useTranslation();
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setBusy(true);
		setError(null);
		try {
			await session.login(
				String(form.get("email")),
				String(form.get("password")),
			);
		} catch (e) {
			setError(
				messageFor(e, {
					UNAUTHORIZED: t("login.UNAUTHORIZED"),
					ACCOUNT_DISABLED: t("login.ACCOUNT_DISABLED"),
					DEVICE_REVOKED: t("login.DEVICE_REVOKED"),
					DEVICE_TAKEN: t("login.DEVICE_TAKEN"),
				}),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="grid min-h-dvh place-items-center bg-background p-4">
			<form
				onSubmit={submit}
				className="grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 shadow-sm"
			>
				<div className="grid gap-2">
					<Logo />
					<h1 className="text-xl font-semibold">{t("login.title")}</h1>
					<p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="email">{t("login.email")}</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autoComplete="username"
						placeholder={t("login.emailPlaceholder")}
						required
						className="h-11"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="password">{t("login.password")}</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="current-password"
						placeholder={t("login.passwordPlaceholder")}
						required
						className="h-11"
					/>
				</div>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<Button type="submit" isDisabled={busy} className="h-11 text-base">
					{busy ? t("login.busy") : t("login.submit")}
				</Button>
			</form>
		</main>
	);
}
