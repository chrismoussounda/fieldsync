import { canManage } from "@fieldsync/work-orders";
import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Navigate,
	useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useApp } from "./app/context.ts";
import { Shell } from "./Shell.tsx";
import { Account } from "./screens/Account.tsx";
import { Conflicts } from "./screens/Conflicts.tsx";
import { Debug } from "./screens/Debug.tsx";
import { Devices } from "./screens/Devices.tsx";
import { JobMap } from "./screens/JobMap.tsx";
import { OrderDetail } from "./screens/OrderDetail.tsx";
import { OrderReport } from "./screens/OrderReport.tsx";
import { Orders } from "./screens/Orders.tsx";
import { Overview } from "./screens/Overview.tsx";
import { Schedule } from "./screens/Schedule.tsx";
import { SiteDetail } from "./screens/SiteDetail.tsx";
import { Sites } from "./screens/Sites.tsx";
import { Team } from "./screens/Team.tsx";

const home = <Navigate to="/" replace />;

const root = createRootRoute({
	component: Shell,
	notFoundComponent: () => home,
});

/** Pages a role may not open send it back to the list. */
function Only({ when, children }: { when: boolean; children: ReactNode }) {
	return when ? children : home;
}

/** `?new=1` opens the create sheet over the list, so the list stays put. */
function useCreating(): { creating: boolean; rest: string | null } {
	return useRouterState({
		select: (s) => {
			const params = new URLSearchParams(s.location.searchStr);
			const creating = params.get("new") === "1";
			params.delete("new");
			return { creating, rest: params.toString() || null };
		},
		structuralSharing: true,
	});
}

function OrderList() {
	const { db, sync, user } = useApp();
	const { creating, rest } = useCreating();
	return (
		// A link's filters replace the ones in use.
		<Orders
			key={rest}
			db={db}
			loop={sync.loop}
			user={user}
			query={rest}
			creating={creating}
		/>
	);
}

const list = createRoute({
	getParentRoute: () => root,
	path: "/",
	component: OrderList,
});

const order = createRoute({
	getParentRoute: () => root,
	path: "/orders/$orderId",
	component: function OrderPage() {
		const { db, sync, session, user } = useApp();
		const { orderId } = order.useParams();
		return (
			<OrderDetail
				key={orderId}
				db={db}
				loop={sync.loop}
				session={session}
				user={user}
				id={orderId}
			/>
		);
	},
});

const report = createRoute({
	getParentRoute: () => root,
	path: "/orders/$orderId/report",
	component: function ReportPage() {
		const { db } = useApp();
		const { orderId } = report.useParams();
		return <OrderReport db={db} id={orderId} />;
	},
});

const overview = createRoute({
	getParentRoute: () => root,
	path: "/overview",
	component: function OverviewPage() {
		const { db, user } = useApp();
		return (
			<Only when={canManage(user.role)}>
				<Overview db={db} />
			</Only>
		);
	},
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const schedule = createRoute({
	getParentRoute: () => root,
	path: "/schedule",
	component: function SchedulePage() {
		const { db, sync, user } = useApp();
		const day = useRouterState({
			select: (s) => new URLSearchParams(s.location.searchStr).get("day"),
		});
		return (
			<Only when={canManage(user.role)}>
				<Schedule
					db={db}
					loop={sync.loop}
					day={day && DAY.test(day) ? day : null}
				/>
			</Only>
		);
	},
});

const map = createRoute({
	getParentRoute: () => root,
	path: "/map",
	component: function MapPage() {
		const { db, user } = useApp();
		return <JobMap db={db} user={user} />;
	},
});

function SiteList() {
	const { db, sync, user } = useApp();
	const { creating } = useCreating();
	return <Sites db={db} loop={sync.loop} user={user} creating={creating} />;
}

const sites = createRoute({
	getParentRoute: () => root,
	path: "/sites",
	component: SiteList,
});

const site = createRoute({
	getParentRoute: () => root,
	path: "/sites/$siteId",
	component: function SitePage() {
		const { db, sync, user } = useApp();
		const { siteId } = site.useParams();
		return (
			<SiteDetail
				key={siteId}
				db={db}
				loop={sync.loop}
				user={user}
				id={siteId}
			/>
		);
	},
});

const conflicts = createRoute({
	getParentRoute: () => root,
	path: "/conflicts",
	component: function ConflictsPage() {
		const { db, session, user } = useApp();
		return (
			<Only when={canManage(user.role)}>
				<Conflicts db={db} session={session} />
			</Only>
		);
	},
});

const team = createRoute({
	getParentRoute: () => root,
	path: "/team",
	component: function TeamPage() {
		const { db, session, user } = useApp();
		return (
			<Only when={user.role === "admin"}>
				<Team db={db} session={session} user={user} />
			</Only>
		);
	},
});

const devices = createRoute({
	getParentRoute: () => root,
	path: "/devices",
	component: function DevicesPage() {
		const { session, user } = useApp();
		return (
			<Only when={user.role === "admin"}>
				<Devices session={session} />
			</Only>
		);
	},
});

const account = createRoute({
	getParentRoute: () => root,
	path: "/account",
	component: function AccountPage() {
		const { session, user, pending } = useApp();
		return <Account session={session} user={user} pending={pending} />;
	},
});

const debug = createRoute({
	getParentRoute: () => root,
	path: "/debug",
	component: function DebugPage() {
		const { db, sync } = useApp();
		return <Debug db={db} sync={sync} />;
	},
});

// Signing in from the landing page lands here; the list is the home page.
const login = createRoute({
	getParentRoute: () => root,
	path: "/login",
	component: () => home,
});

export const router = createRouter({
	routeTree: root.addChildren([
		list,
		order,
		report,
		overview,
		schedule,
		map,
		sites,
		site,
		conflicts,
		team,
		devices,
		account,
		debug,
		login,
	]),
	// Hash links work from the installed app's single offline page.
	history: createHashHistory(),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
