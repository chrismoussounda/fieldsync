import { canManage } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	ClipboardList,
	GitMerge,
	LayoutDashboard,
	type LucideIcon,
	MapPin,
	Smartphone,
	UserRound,
	Users,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { I18nProvider } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { ROUTES, type Route, useRoute } from "./app/route.ts";
import { type Sync, startSync } from "./app/workspace.ts";
import type { Session, User } from "./auth/session.ts";
import { Account } from "./screens/Account.tsx";
import { Conflicts } from "./screens/Conflicts.tsx";
import { Debug } from "./screens/Debug.tsx";
import { Devices } from "./screens/Devices.tsx";
import { Login } from "./screens/Login.tsx";
import { Logo } from "./screens/Logo.tsx";
import { OrderDetail } from "./screens/OrderDetail.tsx";
import { OrderReport } from "./screens/OrderReport.tsx";
import { Orders } from "./screens/Orders.tsx";
import { Overview } from "./screens/Overview.tsx";
import { SignOut } from "./screens/SignOut.tsx";
import { SiteDetail } from "./screens/SiteDetail.tsx";
import { Sites } from "./screens/Sites.tsx";
import { SyncBadge } from "./screens/SyncBadge.tsx";
import { Team } from "./screens/Team.tsx";
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
				<Login session={session} />
			)}
		</I18nProvider>
	);
}

function SignedIn({ db, session, user }: Props & { user: User }) {
	const [sync, setSync] = useState<Sync | null>(null);
	const { t } = useTranslation();
	const route = useRoute();
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

	const manage = canManage(user.role);
	const admin = user.role === "admin";
	const items = [
		nav(
			ROUTES.list,
			t("nav.jobs"),
			ClipboardList,
			true,
			"list",
			"order",
			"new",
			"report",
		),
		nav(
			ROUTES.overview,
			t("nav.overview"),
			LayoutDashboard,
			manage,
			"overview",
		),
		nav(ROUTES.sites, t("nav.sites"), MapPin, true, "sites", "site"),
	].filter((item) => item !== null);
	const office = [
		nav(ROUTES.conflicts, t("nav.conflicts"), GitMerge, manage, "conflicts"),
		nav(ROUTES.team, t("nav.team"), Users, admin, "team"),
		nav(ROUTES.devices, t("nav.devices"), Smartphone, admin, "devices"),
	].filter((item) => item !== null);
	const account = nav(
		ROUTES.account,
		t("nav.account"),
		UserRound,
		true,
		"account",
	);

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
			<aside className="print:hidden! sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar p-4 md:flex">
				<a href={ROUTES.list}>
					<Logo />
				</a>
				<nav aria-label={t("nav.main")} className="grid gap-1">
					{[...items, ...office].map((item) => (
						<SideLink key={item.href} item={item} route={route.name} />
					))}
				</nav>
				<div className="mt-auto grid gap-3">
					<a
						href={ROUTES.account}
						className="flex items-center gap-3 rounded-xl p-2 text-foreground hover:bg-sidebar-accent"
					>
						<span className="grid size-9 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
							{initials(user.name)}
						</span>
						<span className="grid leading-tight">
							<span className="font-medium">{user.name}</span>
							<span className="text-sm text-muted-foreground">
								{t(`roles.${user.role}`)}
							</span>
						</span>
					</a>
					<SignOut session={session} pending={pending} />
				</div>
			</aside>
			<div className="min-w-0">
				<header className="print:hidden! sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
					<a href={ROUTES.list} className="md:hidden">
						<Logo />
					</a>
					<div className="ml-auto">
						{sync && <SyncBadge loop={sync.loop} pending={pending} />}
					</div>
				</header>
				<main className="px-4 pt-6 pb-32 has-[[data-action-bar]]:pb-52 md:px-10 md:pt-10 md:pb-14 print:p-0">
					{route.name === "overview" && canManage(user.role) ? (
						<Overview db={db} />
					) : route.name === "list" || route.name === "new" || !sync ? (
						// A new link's filters replace the current ones.
						<Orders
							key={route.name === "list" ? route.query : null}
							db={db}
							loop={sync?.loop ?? null}
							user={user}
							query={route.name === "list" ? route.query : null}
							creating={route.name === "new"}
						/>
					) : route.name === "report" ? (
						<OrderReport db={db} id={route.id} />
					) : route.name === "sites" ||
						(route.name === "site" && route.id === null) ? (
						<Sites
							db={db}
							loop={sync.loop}
							user={user}
							creating={route.name === "site"}
						/>
					) : route.name === "site" && route.id ? (
						<SiteDetail
							key={route.id}
							db={db}
							loop={sync.loop}
							user={user}
							id={route.id}
						/>
					) : route.name === "devices" ? (
						<Devices session={session} />
					) : route.name === "team" ? (
						<Team db={db} session={session} user={user} />
					) : route.name === "account" ? (
						<Account session={session} user={user} pending={pending} />
					) : route.name === "conflicts" ? (
						<Conflicts db={db} session={session} />
					) : route.name === "debug" ? (
						<Debug db={db} sync={sync} />
					) : (
						route.name === "order" && (
							<OrderDetail
								key={route.id}
								db={db}
								loop={sync.loop}
								session={session}
								user={user}
								id={route.id}
							/>
						)
					)}
				</main>
			</div>
			<Toaster position="top-center" />
			<nav
				aria-label={t("nav.main")}
				className="print:hidden! fixed inset-x-3 bottom-3 z-20 grid auto-cols-fr grid-flow-col rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur md:hidden"
			>
				{[...items, account]
					.filter((item) => item !== null)
					.map((item) => (
						<TabLink key={item.href} item={item} route={route.name} />
					))}
			</nav>
		</div>
	);
}

function nav(
	href: string,
	label: string,
	icon: LucideIcon,
	shown: boolean,
	...active: Route["name"][]
): NavItem | null {
	return shown ? { href, label, icon, active } : null;
}

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	active: Route["name"][];
};

function SideLink({ item, route }: { item: NavItem; route: Route["name"] }) {
	const Icon = item.icon;
	const current = item.active.includes(route);
	return (
		<a
			href={item.href}
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				current && "bg-sidebar-accent text-sidebar-accent-foreground",
			)}
		>
			<Icon className="size-5" aria-hidden />
			{item.label}
		</a>
	);
}

function TabLink({ item, route }: { item: NavItem; route: Route["name"] }) {
	const Icon = item.icon;
	const current = item.active.includes(route);
	return (
		<a
			href={item.href}
			aria-current={current ? "page" : undefined}
			className={cn(
				"grid min-h-14 place-items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium text-muted-foreground",
				current && "bg-accent text-accent-foreground",
			)}
		>
			<Icon className="size-5" aria-hidden />
			{item.label}
		</a>
	);
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

function Revoked({ session }: { session: Session }) {
	const { t } = useTranslation();
	return (
		<main className="grid min-h-dvh place-items-center p-4">
			<div className="grid w-full max-w-sm gap-4 rounded-2xl border bg-card p-6">
				<h1 className="text-xl font-semibold">{t("revoked.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("revoked.body")}</p>
				<Button variant="destructive" onPress={() => void session.signOut()}>
					{t("revoked.erase")}
				</Button>
			</div>
		</main>
	);
}
