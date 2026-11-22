import { canManage, SITE } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import {
	ArrowLeft,
	Building2,
	KeyRound,
	MapPin,
	Navigation,
	Pencil,
	Phone,
	Trash2,
	UserRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { MapView } from "@/components/map";
import { StatusBadge } from "@/components/status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { directionsUrl } from "@/lib/maps";
import { useSheet } from "@/lib/use-sheet";
import { ROUTES } from "../app/route.ts";
import { jobsAt, type Site, telLink, toSite } from "../app/sites.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";
import { SiteSheet } from "./SiteSheet.tsx";

type Props = { db: LocalDb; loop: SyncLoop; user: User; id: string };

/** A customer site: how to reach it, who to ask for, and its jobs. */
export function SiteDetail({ db, loop, user, id }: Props) {
	const { t } = useTranslation();
	const site = useLiveQuery(async () => {
		const row = await db.entities.get([SITE, id]);
		return row ? toSite(id, row.state) : null;
	}, [db, id]);
	const edit = useSheet<true>();
	const [deleting, setDeleting] = useState(false);
	if (site === undefined) return null;
	if (!site) {
		return (
			<div className="grid place-items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
				<p className="font-medium">{t("sites.gone")}</p>
				<BackLink />
			</div>
		);
	}
	const manage = canManage(user.role);

	async function remove() {
		await loop.mutate({ entityType: SITE, entityId: id, kind: "delete" });
		toast.success(t("sites.deleted"));
		window.location.hash = ROUTES.sites;
	}

	return (
		<div className="grid grid-cols-1 gap-8">
			<BackLink />
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 gap-4">
					<span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
						<Building2 aria-hidden className="size-6" />
					</span>
					<div className="grid min-w-0 gap-1">
						<h1 className="text-2xl font-semibold tracking-tight">
							{site.name}
						</h1>
						{site.address && (
							<p className="flex items-center gap-1.5 text-muted-foreground">
								<MapPin aria-hidden className="size-4 shrink-0" />
								{site.address}
							</p>
						)}
					</div>
				</div>
				<div className="flex w-full gap-2 sm:w-auto">
					{site.contactPhone && (
						<LinkButton
							href={telLink(site.contactPhone)}
							className="h-11 flex-1 px-4 sm:h-10 sm:flex-none"
						>
							<Phone aria-hidden />
							{t("sites.call")}
						</LinkButton>
					)}
					{site.location && (
						<LinkButton
							href={directionsUrl(site.location)}
							target="_blank"
							rel="noreferrer"
							variant="outline"
							className="h-11 flex-1 px-4 sm:h-10 sm:flex-none"
						>
							<Navigation aria-hidden />
							{t("sites.directions")}
						</LinkButton>
					)}
					{manage && (
						<>
							<Button
								variant="outline"
								aria-label={t("common.edit")}
								className="size-11 sm:h-10 sm:w-auto sm:px-4"
								onPress={() => edit.show(true)}
							>
								<Pencil aria-hidden />
								<span className="max-sm:hidden">{t("common.edit")}</span>
							</Button>
							<Button
								variant="destructive"
								aria-label={t("common.delete")}
								className="size-11 sm:h-10 sm:w-auto sm:px-4"
								onPress={() => setDeleting(true)}
							>
								<Trash2 aria-hidden />
								<span className="max-sm:hidden">{t("common.delete")}</span>
							</Button>
						</>
					)}
				</div>
			</div>
			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				<SiteInfo site={site} />
				<SiteJobs db={db} siteId={id} />
			</div>
			{manage && (
				<>
					{edit.value && (
						<SiteSheet
							key={edit.key}
							open={edit.open}
							onOpenChange={(open) => !open && edit.hide()}
							loop={loop}
							site={site}
						/>
					)}
					<Confirm
						open={deleting}
						onOpenChange={setDeleting}
						title={t("sites.deleteTitle")}
						description={t("sites.deleteBody")}
						confirmLabel={t("common.delete")}
						onConfirm={() => void remove()}
					/>
				</>
			)}
		</div>
	);
}

function BackLink() {
	const { t } = useTranslation();
	return (
		<a
			href={ROUTES.sites}
			className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft aria-hidden className="size-4" />
			{t("sites.allSites")}
		</a>
	);
}

function SiteInfo({ site }: { site: Site }) {
	const { t } = useTranslation();
	return (
		<section className="grid gap-5 rounded-2xl border bg-card p-6">
			{site.location ? (
				<MapView
					location={site.location}
					label={t("sites.mapOf", { name: site.name })}
					className="-mx-2 -mt-2"
				/>
			) : (
				<p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
					<MapPin aria-hidden className="size-4 shrink-0" />
					{t("sites.noLocation")}
				</p>
			)}
			<InfoRow icon={<UserRound />} title={t("sites.contact")}>
				{site.contactName || site.contactPhone ? (
					<>
						{site.contactName && <p>{site.contactName}</p>}
						{site.contactPhone && (
							<a href={telLink(site.contactPhone)} className="w-fit">
								{site.contactPhone}
							</a>
						)}
					</>
				) : (
					<p className="text-muted-foreground">{t("sites.noContact")}</p>
				)}
			</InfoRow>
			<InfoRow icon={<KeyRound />} title={t("sites.accessNotes")}>
				{site.accessNotes ? (
					<p className="rounded-xl bg-warning/10 p-3 whitespace-pre-line">
						{site.accessNotes}
					</p>
				) : (
					<p className="text-muted-foreground">{t("sites.noNotes")}</p>
				)}
			</InfoRow>
		</section>
	);
}

function InfoRow({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="flex gap-3">
			<span className="mt-0.5 text-muted-foreground [&_svg]:size-4">
				{icon}
			</span>
			<div className="grid min-w-0 flex-1 gap-1 text-sm">
				<h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					{title}
				</h2>
				{children}
			</div>
		</div>
	);
}

function SiteJobs({ db, siteId }: { db: LocalDb; siteId: string }) {
	const { t } = useTranslation();
	const jobs = useLiveQuery(() => jobsAt(db, siteId), [db, siteId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (!jobs) return null;
	const names = new Map(members?.map((m) => [m.id, m.name]));
	return (
		<section className="grid gap-3 rounded-2xl border bg-card p-6">
			<h2 className="font-semibold">{t("sites.jobs")}</h2>
			{jobs.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t("sites.noJobs")}</p>
			) : (
				<ul className="-mx-2 grid">
					{jobs.map((job) => (
						<li key={job.id}>
							<a
								href={ROUTES.order(job.id)}
								className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 font-normal text-foreground hover:bg-muted"
							>
								<span className="grid min-w-0 gap-0.5">
									<span className="truncate font-medium">{job.title}</span>
									<span className="text-sm text-muted-foreground">
										{[
											job.dueDate &&
												t("sites.due", { date: formatDay(job.dueDate) }),
											job.assigneeId
												? (names.get(job.assigneeId) ?? "")
												: t("sites.unassigned"),
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</span>
								<StatusBadge status={job.status} />
							</a>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
