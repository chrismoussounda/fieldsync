import { Building2, HardHat } from "lucide-react";
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
		await attempt(() =>
			session.login(String(form.get("email")), String(form.get("password"))),
		);
	}

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

	return (
		<main className="grid min-h-dvh place-items-center bg-background p-4">
			<form
				onSubmit={submit}
				className="grid w-full max-w-sm animate-in gap-5 rounded-2xl border bg-card p-6 shadow-sm duration-500 fade-in-0 zoom-in-95"
			>
				<div className="grid gap-2">
					<a href="#/" aria-label={t("login.home")} className="w-fit">
						<Logo />
					</a>
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
				<section aria-labelledby="demo" className="grid gap-3 border-t pt-5">
					<div className="grid gap-1">
						<h2 id="demo" className="font-semibold">
							{t("login.demo")}
						</h2>
						<p className="text-sm text-muted-foreground">
							{t("login.demoHint")}
						</p>
					</div>
					<div className="grid gap-2">
						<Button
							variant="outline"
							isDisabled={busy}
							className="h-11"
							onPress={() => void attempt(() => session.demo("dispatcher"))}
						>
							<Building2 aria-hidden />
							{t("login.asOffice")}
						</Button>
						<Button
							variant="outline"
							isDisabled={busy}
							className="h-11"
							onPress={() => void attempt(() => session.demo("technician"))}
						>
							<HardHat aria-hidden />
							{t("login.asTechnician")}
						</Button>
					</div>
				</section>
			</form>
		</main>
	);
}
