import { canManage } from "@fieldsync/work-orders";
import { Outlet, useRouterState } from "@tanstack/react-router";
import {
	CalendarRange,
	ClipboardList,
	GitMerge,
	LayoutDashboard,
	type LucideIcon,
	Map as MapIcon,
	MapPin,
	Smartphone,
	UserRound,
	Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { initials } from "@/components/person";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useApp } from "./app/context.ts";
import { ROUTES } from "./app/route.ts";
import { Logo } from "./screens/Logo.tsx";
import { SignOut } from "./screens/SignOut.tsx";
import { SyncBadge } from "./screens/SyncBadge.tsx";

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	/** Whether the page at this path belongs to the item. */
	owns: (path: string) => boolean;
};

const under =
	(...prefixes: string[]) =>
	(path: string) =>
		prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/** The frame around every signed-in page. */
export function Shell() {
	const { t } = useTranslation();
	const { session, user, sync, pending } = useApp();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const manage = canManage(user.role);
	const admin = user.role === "admin";
	const show = (item: NavItem, shown: boolean) => (shown ? [item] : []);

	const items: NavItem[] = [
		{
			href: ROUTES.list,
			label: t("nav.jobs"),
			icon: ClipboardList,
			owns: (p) => p === "/" || under("/new", "/orders")(p),
		},
		...show(
			{
				href: ROUTES.overview,
				label: t("nav.overview"),
				icon: LayoutDashboard,
				owns: under("/overview"),
			},
			manage,
		),
		...show(
			{
				href: ROUTES.schedule(),
				label: t("nav.schedule"),
				icon: CalendarRange,
				owns: under("/schedule"),
			},
			manage,
		),
		{
			href: ROUTES.map,
			label: t("nav.map"),
			icon: MapIcon,
			owns: under("/map"),
		},
		{
			href: ROUTES.sites,
			label: t("nav.sites"),
			icon: MapPin,
			owns: under("/sites"),
		},
	];
	const office: NavItem[] = [
		...show(
			{
				href: ROUTES.conflicts,
				label: t("nav.conflicts"),
				icon: GitMerge,
				owns: under("/conflicts"),
			},
			manage,
		),
		...show(
			{
				href: ROUTES.team,
				label: t("nav.team"),
				icon: Users,
				owns: under("/team"),
			},
			admin,
		),
		...show(
			{
				href: ROUTES.devices,
				label: t("nav.devices"),
				icon: Smartphone,
				owns: under("/devices"),
			},
			admin,
		),
	];
	const account: NavItem = {
		href: ROUTES.account,
		label: t("nav.account"),
		icon: UserRound,
		owns: under("/account"),
	};

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
			<aside className="print:hidden! sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar p-4 md:flex">
				<a href={ROUTES.list}>
					<Logo />
				</a>
				<nav aria-label={t("nav.main")} className="grid gap-1">
					{[...items, ...office].map((item) => (
						<SideLink key={item.href} item={item} path={path} />
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
				<header className="print:hidden! sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background px-4">
					<a href={ROUTES.list} className="md:hidden">
						<Logo />
					</a>
					<div className="ml-auto">
						<SyncBadge loop={sync.loop} pending={pending} />
					</div>
				</header>
				<main className="px-4 pt-6 pb-32 has-[[data-action-bar]]:pb-52 md:px-10 md:pt-10 md:pb-14 print:p-0">
					{/* Each page fades in as it opens. */}
					<div
						key={path}
						className="animate-in duration-300 fade-in-0 slide-in-from-bottom-2"
					>
						<Outlet />
					</div>
				</main>
			</div>
			<Toaster position="top-center" />
			<nav
				aria-label={t("nav.main")}
				className="print:hidden! fixed inset-x-3 bottom-3 z-20 grid auto-cols-fr grid-flow-col rounded-2xl border bg-card p-1.5 shadow-lg md:hidden"
			>
				{[...items, account].map((item) => (
					<TabLink key={item.href} item={item} path={path} />
				))}
			</nav>
		</div>
	);
}

function SideLink({ item, path }: { item: NavItem; path: string }) {
	const Icon = item.icon;
	const current = item.owns(path);
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

function TabLink({ item, path }: { item: NavItem; path: string }) {
	const Icon = item.icon;
	const current = item.owns(path);
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
