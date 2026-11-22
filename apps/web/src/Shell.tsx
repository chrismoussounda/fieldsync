import { canManage } from "@fieldsync/work-orders";
import { Outlet, useRouterState } from "@tanstack/react-router";
import {
	CalendarRange,
	ClipboardList,
	Ellipsis,
	GitMerge,
	LayoutDashboard,
	type LucideIcon,
	Map as MapIcon,
	MapPin,
	Smartphone,
	UserRound,
	Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { initials } from "@/components/person";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useApp } from "./app/context.ts";
import { ROUTES } from "./app/route.ts";
import { Logo } from "./screens/Logo.tsx";
import { SignOut } from "./screens/SignOut.tsx";
import { SyncBadge } from "./screens/SyncBadge.tsx";

type NavItem = {
	id: string;
	href: string;
	label: string;
	icon: LucideIcon;
	/** Whether the page at this path belongs to the item. */
	owns: (path: string) => boolean;
};

/** A phone's tab bar fits four; the rest go under "More". */
const TABS = 4;
const FIRST = ["jobs", "schedule", "map"];

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
			id: "jobs",
			label: t("nav.jobs"),
			icon: ClipboardList,
			owns: (p) => p === "/" || under("/new", "/orders")(p),
		},
		...show(
			{
				href: ROUTES.overview,
				id: "overview",
				label: t("nav.overview"),
				icon: LayoutDashboard,
				owns: under("/overview"),
			},
			manage,
		),
		...show(
			{
				href: ROUTES.schedule(),
				id: "schedule",
				label: t("nav.schedule"),
				icon: CalendarRange,
				owns: under("/schedule"),
			},
			manage,
		),
		{
			href: ROUTES.map,
			id: "map",
			label: t("nav.map"),
			icon: MapIcon,
			owns: under("/map"),
		},
		{
			href: ROUTES.sites,
			id: "sites",
			label: t("nav.sites"),
			icon: MapPin,
			owns: under("/sites"),
		},
	];
	const office: NavItem[] = [
		...show(
			{
				href: ROUTES.conflicts,
				id: "conflicts",
				label: t("nav.conflicts"),
				icon: GitMerge,
				owns: under("/conflicts"),
			},
			manage,
		),
		...show(
			{
				href: ROUTES.team,
				id: "team",
				label: t("nav.team"),
				icon: Users,
				owns: under("/team"),
			},
			admin,
		),
		...show(
			{
				href: ROUTES.devices,
				id: "devices",
				label: t("nav.devices"),
				icon: Smartphone,
				owns: under("/devices"),
			},
			admin,
		),
	];
	const account: NavItem = {
		href: ROUTES.account,
		id: "account",
		label: t("nav.account"),
		icon: UserRound,
		owns: under("/account"),
	};

	const everything = [...items, ...office, account];
	const tabs =
		everything.length <= TABS
			? everything
			: everything.filter((i) => FIRST.includes(i.id)).slice(0, TABS - 1);
	const more = everything.filter((i) => !tabs.includes(i));

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
				<header className="print:hidden! sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-10">
					<a href={ROUTES.list} className="md:hidden">
						<Logo />
					</a>
					<div className="ml-auto">
						<SyncBadge loop={sync.loop} pending={pending} />
					</div>
				</header>
				<main className="px-4 pt-6 pb-32 has-[[data-action-bar]]:pb-52 md:px-10 md:pt-8 md:pb-14 print:p-0">
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
				{tabs.map((item) => (
					<TabLink key={item.href} item={item} path={path} />
				))}
				{more.length > 0 && (
					<MoreTab
						items={more}
						path={path}
						footer={
							<>
								<p className="grid px-2 leading-tight">
									<span className="font-medium">{user.name}</span>
									<span className="text-sm text-muted-foreground">
										{t(`roles.${user.role}`)}
									</span>
								</p>
								<SignOut session={session} pending={pending} />
							</>
						}
					/>
				)}
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
				"flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
				current &&
					"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
				"grid min-h-14 min-w-0 place-items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors",
				current && "bg-accent text-accent-foreground",
			)}
		>
			<Icon className="size-5" aria-hidden />
			{item.label}
		</a>
	);
}

/** The tab that opens every page the bar has no room for. */
function MoreTab({
	items,
	path,
	footer,
}: {
	items: NavItem[];
	path: string;
	footer: ReactNode;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const current = items.some((i) => i.owns(path));
	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<button
				type="button"
				aria-current={current ? "page" : undefined}
				onClick={() => setOpen(true)}
				className={cn(
					"grid min-h-14 min-w-0 cursor-pointer place-items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors",
					current && "bg-accent text-accent-foreground",
				)}
			>
				<Ellipsis className="size-5" aria-hidden />
				{t("nav.more")}
			</button>
			<DrawerContent>
				<div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
				<div className="grid gap-4 overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<DrawerTitle className="px-2 text-lg font-semibold">
						{t("nav.more")}
					</DrawerTitle>
					<nav aria-label={t("nav.more")} className="grid gap-1">
						{items.map((item) => {
							const Icon = item.icon;
							const here = item.owns(path);
							return (
								<a
									key={item.href}
									href={item.href}
									aria-current={here ? "page" : undefined}
									onClick={() => setOpen(false)}
									className={cn(
										"flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium text-foreground transition-colors hover:bg-muted",
										here && "bg-accent text-accent-foreground",
									)}
								>
									<Icon aria-hidden className="size-5 text-muted-foreground" />
									{item.label}
								</a>
							);
						})}
					</nav>
					<div className="grid gap-2 border-t pt-4">{footer}</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
