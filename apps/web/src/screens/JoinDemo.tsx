import { useTranslation } from "react-i18next";
import { DemoPeople } from "@/components/demo-people";
import { Failure } from "@/components/try-demo";
import { LinkButton } from "@/components/ui/button";
import { ROUTES } from "../app/route.ts";
import { useSignIn } from "../app/use-sign-in.ts";
import type { Person, Session, User } from "../auth/session.ts";
import { Logo } from "./Logo.tsx";

/** Opened from a demo's link, to become one of its people on this device. */
export function JoinDemo({
	session,
	invite,
	user,
}: {
	session: Session;
	invite: string;
	user: User | null;
}) {
	const { t } = useTranslation();
	const { error, busy, attempt } = useSignIn();
	// Still joining just after the sign-in, until the app opens.
	const already = busy ? null : user;

	async function join(person: Person) {
		await attempt(async () => {
			await session.joinDemo(invite, person);
			// Not kept in the history: going back would ask again.
			window.location.replace(ROUTES.list);
		});
	}

	return (
		<main className="grid min-h-dvh place-items-center bg-background p-4">
			<div className="grid w-full max-w-120 animate-in gap-5 rounded-2xl border bg-card p-6 shadow-sm duration-500 fade-in-0 zoom-in-95 sm:p-8">
				<Logo />
				<div className="grid gap-2">
					<h1 className="text-xl font-semibold">{t("demo.joinTitle")}</h1>
					<p className="text-muted-foreground">
						{already
							? t("demo.alreadyIn", { name: already.name })
							: t("demo.joinHint")}
					</p>
				</div>
				{already ? (
					<>
						<p className="text-muted-foreground">{t("demo.alreadyHint")}</p>
						<LinkButton href={ROUTES.list} className="h-11">
							{t("demo.back")}
						</LinkButton>
					</>
				) : (
					<>
						<DemoPeople busy={busy} onPick={(person) => void join(person)} />
						<Failure error={error} className="text-destructive" />
						{error && (
							<LinkButton href={ROUTES.list} variant="outline" className="h-11">
								{t("demo.home")}
							</LinkButton>
						)}
					</>
				)}
			</div>
		</main>
	);
}
