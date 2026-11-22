import { canManage } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	Building2,
	MapPin,
	Phone,
	Plus,
	Search,
	UserRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ITEM_IN } from "@/lib/use-leaving";
import { usePhone } from "@/lib/use-phone";
import { useOpeningKey } from "@/lib/use-sheet";
import { ROUTES } from "../app/route.ts";
import { openJobsBySite, type Site, sitesOf, telLink } from "../app/sites.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";
import { SiteSheet } from "./SiteSheet.tsx";

type Props = { db: LocalDb; loop: SyncLoop; user: User; creating: boolean };

export function Sites({ db, loop, user, creating }: Props) {
	const { t } = useTranslation();
	const phone = usePhone();
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const jobs = useLiveQuery(() => openJobsBySite(db), [db]);
	const [search, setSearch] = useState("");
	const opening = useOpeningKey(creating);
	if (!sites) return null;
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	const shown = sites.filter((s) => {
		const text = [s.name, s.address, s.contactName].join(" ").toLowerCase();
		return words.every((w) => text.includes(w));
	});
	const manage = canManage(user.role);

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("sites.title")}
				description={t("sites.count", { count: sites.length })}
				actions={
					manage && (
						<LinkButton href={ROUTES.newSite} className="h-10 px-4">
							<Plus aria-hidden />
							{t("sites.new")}
						</LinkButton>
					)
				}
			/>
			<div className="relative max-w-md">
				<Search
					aria-hidden
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					aria-label={t("common.search")}
					placeholder={t("sites.search")}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-10 bg-card pl-9"
				/>
			</div>
			{shown.length === 0 ? (
				<div className="grid place-items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
					<Building2 aria-hidden className="size-8 text-muted-foreground" />
					<p className="font-medium">
						{sites.length === 0 ? t("sites.empty") : t("sites.noMatch")}
					</p>
					{sites.length === 0 && (
						<p className="text-sm text-muted-foreground">
							{t("sites.emptyHint")}
						</p>
					)}
				</div>
			) : phone ? (
				<ul className="grid gap-3">
					{shown.map((site) => (
						<li key={site.id} className={ITEM_IN}>
							<SiteCard site={site} />
						</li>
					))}
				</ul>
			) : (
				<SiteTable
					sites={shown}
					jobs={jobs ?? new Map()}
					empty={t("sites.noMatch")}
				/>
			)}
			{manage && (
				<SiteSheet
					key={opening}
					open={creating}
					onOpenChange={(open) => {
						if (!open) window.location.hash = ROUTES.sites;
					}}
					loop={loop}
					site={null}
				/>
			)}
		</div>
	);
}

function SiteTable({
	sites,
	jobs,
	empty,
}: {
	sites: Site[];
	jobs: ReadonlyMap<string, number>;
	empty: string;
}) {
	const { t } = useTranslation();
	const helper = columnHelper<Site>();
	const columns = helper.columns([
		helper.accessor("name", {
			header: t("sites.site"),
			cell: ({ row }) => (
				<span className="flex min-w-0 items-center gap-3">
					<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
						<Building2 aria-hidden className="size-4" />
					</span>
					<span className="grid min-w-0 gap-0.5">
						<a
							href={ROUTES.site(row.original.id)}
							className="truncate font-medium text-foreground after:absolute after:inset-0 hover:underline"
						>
							{row.original.name}
						</a>
						{row.original.address && (
							<span className="truncate text-sm text-muted-foreground">
								{row.original.address}
							</span>
						)}
					</span>
				</span>
			),
			meta: { className: "max-w-[28rem]" },
		}),
		helper.accessor("contactName", {
			header: t("sites.contact"),
			cell: ({ row }) =>
				row.original.contactName ? (
					<Person
						name={row.original.contactName}
						detail={row.original.contactPhone || undefined}
					/>
				) : row.original.contactPhone ? (
					<a
						href={telLink(row.original.contactPhone)}
						className="relative z-10"
					>
						{row.original.contactPhone}
					</a>
				) : (
					<span className="text-muted-foreground">{t("sites.noContact")}</span>
				),
		}),
		helper.accessor((s) => jobs.get(s.id) ?? 0, {
			id: "jobs",
			header: t("sites.openJobs"),
			cell: ({ getValue }) => {
				const count = getValue();
				return count > 0 ? (
					<span className="inline-flex rounded-full bg-status-active/12 px-2.5 py-0.5 text-sm font-medium text-status-active">
						{t("sites.jobCount", { count })}
					</span>
				) : (
					<span className="text-muted-foreground">{t("sites.noOpenJobs")}</span>
				);
			},
		}),
	]);
	return (
		<DataTable
			label={t("sites.title")}
			data={sites}
			columns={columns}
			getRowId={(s) => s.id}
			onRowAction={(s) => {
				window.location.hash = ROUTES.site(s.id);
			}}
			empty={empty}
		/>
	);
}

function SiteCard({ site }: { site: Site }) {
	return (
		<a
			href={ROUTES.site(site.id)}
			className="flex h-full gap-4 rounded-2xl border bg-card p-5 font-normal text-foreground transition-colors hover:border-primary/50 hover:bg-accent/30"
		>
			<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
				<Building2 aria-hidden className="size-5" />
			</span>
			<span className="grid min-w-0 gap-1 text-sm">
				<span className="truncate text-base font-semibold">{site.name}</span>
				{site.address && (
					<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
						<MapPin aria-hidden className="size-3.5 shrink-0" />
						<span className="truncate">{site.address}</span>
					</span>
				)}
				{(site.contactName || site.contactPhone) && (
					<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
						{site.contactName && (
							<span className="flex items-center gap-1.5">
								<UserRound aria-hidden className="size-3.5" />
								{site.contactName}
							</span>
						)}
						{site.contactPhone && (
							<span className="flex items-center gap-1.5">
								<Phone aria-hidden className="size-3.5" />
								{site.contactPhone}
							</span>
						)}
					</span>
				)}
			</span>
		</a>
	);
}
