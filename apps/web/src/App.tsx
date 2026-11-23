import { lazy, Suspense, useSyncExternalStore } from "react";
import { I18nProvider } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";
import type { Session } from "./auth/session.ts";
import { JoinDemo } from "./screens/JoinDemo.tsx";
import { Landing } from "./screens/Landing.tsx";
import { Login } from "./screens/Login.tsx";
import { Opening } from "./screens/Opening.tsx";
import type { LocalDb } from "./sync/storage.ts";

// Visitors don't pay for the app; the service worker has it ready for sign-in.
const SignedIn = lazy(() =>
	import("./SignedIn.tsx").then((m) => ({ default: m.SignedIn })),
);

type Props = { db: LocalDb; session: Session };

export function App({ db, session }: Props) {
	const { user, revoked } = useSyncExternalStore(
		session.subscribe,
		session.snapshot,
	);
	const language = useLanguage();
	const invited = /^#\/demo\/([\w-]+)$/.exec(useHash())?.[1];
	return (
		<I18nProvider locale={language === "fr" ? "fr-FR" : "en-GB"}>
			{revoked ? (
				<Revoked session={session} />
			) : invited ? (
				<JoinDemo session={session} invite={invited} user={user} />
			) : user ? (
				<Suspense fallback={<Opening />}>
					<SignedIn key={user.id} db={db} session={session} user={user} />
				</Suspense>
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

const useHash = () =>
	useSyncExternalStore(subscribe, () => window.location.hash);

/** The landing page at the root; any other link asks to sign in first. */
function Public({ session }: { session: Session }) {
	const hash = useHash();
	const home = hash === "" || hash === "#" || hash === "#/";
	return home ? <Landing session={session} /> : <Login session={session} />;
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
