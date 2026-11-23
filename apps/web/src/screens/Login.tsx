import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Failure, StartDemo } from "@/components/try-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSignIn } from "../app/use-sign-in.ts";
import type { Session } from "../auth/session.ts";
import { Logo } from "./Logo.tsx";

export function Login({ session }: { session: Session }) {
	const { t } = useTranslation();
	const { error, busy, attempt } = useSignIn();
	const [account, setAccount] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		await attempt(() =>
			session.login(String(form.get("email")), String(form.get("password"))),
		);
	}

	return (
		<main className="grid min-h-dvh place-items-center bg-background p-4">
			<div className="grid w-full max-w-120 animate-in gap-5 rounded-2xl border bg-card p-6 shadow-sm duration-500 fade-in-0 zoom-in-95 sm:p-8">
				<div className="grid gap-2">
					<a href="#/" aria-label={t("login.home")} className="w-fit">
						<Logo />
					</a>
					<h1 className="text-xl font-semibold">{t("login.title")}</h1>
					<p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
				</div>
				<section aria-labelledby="demo" className="grid gap-3">
					<div className="grid gap-1">
						<h2 id="demo" className="font-semibold">
							{t("login.demo")}
						</h2>
						<p className="text-sm text-muted-foreground">
							{t("login.demoHint")}
						</p>
					</div>
					<StartDemo session={session} />
				</section>
				<div className="grid border-t pt-5">
					{account ? (
						<form
							onSubmit={submit}
							className="grid animate-in gap-5 duration-300 fade-in-0 slide-in-from-top-2"
						>
							<div className="grid gap-2">
								<Label htmlFor="email">{t("login.email")}</Label>
								<Input
									id="email"
									name="email"
									type="email"
									autoComplete="username"
									placeholder={t("login.emailPlaceholder")}
									required
									autoFocus
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
							<Failure error={error} className="text-destructive" />
							<Button
								type="submit"
								isDisabled={busy}
								className="h-11 text-base"
							>
								{busy ? t("login.busy") : t("login.submit")}
							</Button>
							<p className="text-sm text-muted-foreground">
								{t("login.accountHint")}
							</p>
						</form>
					) : (
						<Button
							variant="outline"
							className="h-11"
							onPress={() => setAccount(true)}
						>
							{t("login.haveAccount")}
						</Button>
					)}
				</div>
			</div>
		</main>
	);
}
