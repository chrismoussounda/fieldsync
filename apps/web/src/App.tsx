import { RouterProvider } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { I18nProvider } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";
import { AppContext } from "./app/context.ts";
import { type Sync, startSync } from "./app/workspace.ts";
import type { Session, User } from "./auth/session.ts";
import { router } from "./routes.tsx";
import { Landing } from "./screens/Landing.tsx";
import { Login } from "./screens/Login.tsx";
import { Logo } from "./screens/Logo.tsx";
import type { LocalDb } from "./sync/storage.ts";

type Props = { db: LocalDb; session: Session };

export function App({ db, session }: Props) {
	const { user, revoked } = useSyncExternalStore(
		session.subscribe,
		session.snapshot,
	);
	const language = useLanguage();
	return (
		<I18nProvider locale={language === "fr" ? "fr-FR" : "en-GB"}>
			{revoked ? (
				<Revoked session={session} />
			) : user ? (
				<SignedIn key={user.id} db={db} session={session} user={user} />
			) : (
				<Public session={session} />
			)}
		</I18nProvider>
	);
}

const subscribe = (listener: () => void) => {
	window.addEventListener("hashchange", listener);
	return () => window.removeEventListener("hashchange", listener);
};

/** The landing page at the root; any other link asks to sign in first. */
function Public({ session }: { session: Session }) {
	const hash = useSyncExternalStore(subscribe, () => window.location.hash);
	const home = hash === "" || hash === "#" || hash === "#/";
	return home ? <Landing /> : <Login session={session} />;
}

function SignedIn({ db, session, user }: Props & { user: User }) {
	const [sync, setSync] = useState<Sync | null>(null);
	const pending =
		useLiveQuery(
			() => db.outbox.where("status").anyOf("pending", "inflight").count(),
			[db],
		) ?? 0;

	useEffect(() => {
		let stop: (() => void) | undefined;
		let cancelled = false;
		void startSync(db, session).then((started) => {
			if (cancelled) return started.stop();
			stop = started.stop;
			setSync(started.sync);
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, [db, session]);

	const app = useMemo(
		() => sync && { db, session, user, sync, pending },
		[db, session, user, sync, pending],
	);
	if (!app) {
		return (
			<div className="grid min-h-dvh place-items-center">
				<span className="animate-pulse">
					<Logo />
				</span>
			</div>
		);
	}
	return (
		<AppContext.Provider value={app}>
			<RouterProvider router={router} />
		</AppContext.Provider>
	);
}

function Revoked({ session }: { session: Session }) {
	const { t } = useTranslation();
	return (
		<main className="grid min-h-dvh place-items-center p-4">
			<div className="grid w-full max-w-sm gap-4 rounded-2xl border bg-card p-6">
				<h1 className="text-xl font-semibold">{t("revoked.title")}</h1>
				<p className="text-muted-foreground">{t("revoked.body")}</p>
				<Button variant="destructive" onPress={() => void session.signOut()}>
					{t("revoked.erase")}
				</Button>
			</div>
		</main>
	);
}
