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
import { OrderDetail } from "./screens/OrderDetail.tsx";
import { OrderReport } from "./screens/OrderReport.tsx";
import { Orders } from "./screens/Orders.tsx";
import { Overview } from "./screens/Overview.tsx";
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

function OrderList({ creating }: { creating: boolean }) {
	const { db, sync, user } = useApp();
	// A link's filters replace the ones in use.
	const query = useRouterState({
		select: (s) => s.location.searchStr.replace(/^\?/, "") || null,
	});
	return (
		<Orders
			key={query}
			db={db}
			loop={sync.loop}
			user={user}
			query={creating ? null : query}
			creating={creating}
		/>
	);
}

const list = createRoute({
	getParentRoute: () => root,
	path: "/",
	component: () => <OrderList creating={false} />,
});

const newOrder = createRoute({
	getParentRoute: () => root,
	path: "/new",
	component: () => <OrderList creating />,
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

function SiteList({ creating }: { creating: boolean }) {
	const { db, sync, user } = useApp();
	return <Sites db={db} loop={sync.loop} user={user} creating={creating} />;
}

const sites = createRoute({
	getParentRoute: () => root,
	path: "/sites",
	component: () => <SiteList creating={false} />,
});

const newSite = createRoute({
	getParentRoute: () => root,
	path: "/sites/new",
	component: () => <SiteList creating />,
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
		newOrder,
		order,
		report,
		overview,
		sites,
		newSite,
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
