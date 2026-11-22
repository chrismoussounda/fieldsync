import { formatMinutes, minutesBetween } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Printer, Square } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "../app/parts.ts";
import { reportOf } from "../app/report.ts";
import { ROUTES } from "../app/route.ts";
import type { Member } from "../app/workspace.ts";
import { statusLabel } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";
import { Logo } from "./Logo.tsx";
import { PhotoImage } from "./OrderPhotos.tsx";

/** The service report for the customer, printed or saved as PDF from the browser. */
export function OrderReport({ db, id }: { db: LocalDb; id: string }) {
	const { t, i18n } = useTranslation();
	const [now] = useState(Date.now);
	const report = useLiveQuery(() => reportOf(db, id, now), [db, id, now]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	if (report === undefined) return null;
	if (report === null) {
		return (
			<div className="grid place-items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
				<p className="font-medium">{t("order.gone")}</p>
				<a href={ROUTES.list}>{t("order.back")}</a>
			</div>
		);
	}
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString(i18n.language, { dateStyle: "medium" });
	const time = (iso: string) =>
		new Date(iso).toLocaleTimeString(i18n.language, { timeStyle: "short" });
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const { order, site, items, entries, minutes, parts, photos, signature } =
		report;
	const technician = order.assigneeId ? names.get(order.assigneeId) : null;
	const lastStop = entries.flatMap((e) => e.endedAt ?? []).at(-1);

	return (
		<div className="mx-auto grid w-full max-w-4xl gap-6 print:max-w-none print:gap-0">
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<a
					href={ROUTES.order(id)}
					className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft aria-hidden className="size-4" />
					{t("report.back")}
				</a>
				<Button onPress={() => window.print()}>
					<Printer aria-hidden />
					{t("report.print")}
				</Button>
			</div>
			<article className="report grid gap-8 rounded-2xl border bg-card p-6 shadow-sm md:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
				<header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
					<div className="grid gap-3">
						<Logo />
						<div className="grid gap-1">
							<p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
								{t("report.kind")}
							</p>
							<h1 className="text-2xl font-semibold tracking-tight">
								{order.title}
							</h1>
						</div>
					</div>
					<dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1">
						<dt className="text-muted-foreground">{t("report.reference")}</dt>
						<dd className="font-mono font-semibold">
							{id.slice(0, 8).toUpperCase()}
						</dd>
						<dt className="text-muted-foreground">{t("report.date")}</dt>
						<dd className="font-semibold">
							{day(lastStop ?? new Date(now).toISOString())}
						</dd>
						<dt className="text-muted-foreground">{t("report.status")}</dt>
						<dd className="font-semibold">{statusLabel(order.status)}</dd>
					</dl>
				</header>

				<div className="grid gap-6 sm:grid-cols-2">
					<Part title={t("report.customer")}>
						{site && <p className="font-medium">{site.name}</p>}
						{order.address && <p>{order.address}</p>}
						{site?.contactName && <p>{site.contactName}</p>}
						{site?.contactPhone && <p>{site.contactPhone}</p>}
					</Part>
					<Part title={t("report.technician")}>
						<p className="font-medium">
							{technician ?? t("report.notAssigned")}
						</p>
					</Part>
				</div>

				{order.description && (
					<Part title={t("report.request")}>
						<p className="whitespace-pre-wrap">{order.description}</p>
					</Part>
				)}
				<Part title={t("report.work")}>
					<p className="whitespace-pre-wrap">
						{order.notes || t("report.noNotes")}
					</p>
				</Part>

				{items.length > 0 && (
					<Part title={t("report.checklist")}>
						<ul className="grid gap-1.5">
							{items.map((i) => (
								<li key={i.id} className="flex items-center gap-2.5">
									{i.done ? (
										<Check
											aria-hidden
											className="size-4 text-status-done print:text-black"
										/>
									) : (
										<Square
											aria-hidden
											className="size-4 text-muted-foreground"
										/>
									)}
									<span className="sr-only">{i.done ? "☑ " : "☐ "}</span>
									{i.label}
									{!i.done && (
										<span className="text-muted-foreground">
											{t("report.notDone")}
										</span>
									)}
								</li>
							))}
						</ul>
					</Part>
				)}

				{entries.length > 0 && (
					<Part title={t("report.time")}>
						<Table aria-label={t("report.time")}>
							<TableHeader>
								<TableHead isRowHeader>{t("report.date")}</TableHead>
								<TableHead>{t("report.from")}</TableHead>
								<TableHead>{t("report.to")}</TableHead>
								<TableHead>{t("report.technician")}</TableHead>
								<TableHead className="text-right">
									{t("report.duration")}
								</TableHead>
							</TableHeader>
							<TableBody>
								{entries.map((e) => (
									<TableRow key={e.id} id={e.id}>
										<TableCell>{day(e.startedAt)}</TableCell>
										<TableCell>{time(e.startedAt)}</TableCell>
										<TableCell>
											{e.endedAt ? time(e.endedAt) : t("report.running")}
										</TableCell>
										<TableCell>
											{names.get(e.technicianId) ?? t("values.someone")}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatMinutes(
												minutesBetween(e.startedAt, e.endedAt, now),
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<p className="flex justify-between border-t pt-2 font-semibold">
							<span>{t("report.total")}</span>
							<span className="tabular-nums">{formatMinutes(minutes)}</span>
						</p>
					</Part>
				)}

				{parts.length > 0 && (
					<Part title={t("report.parts")}>
						<Table aria-label={t("report.parts")}>
							<TableHeader>
								<TableHead isRowHeader>{t("report.part")}</TableHead>
								<TableHead className="text-right">
									{t("report.quantity")}
								</TableHead>
							</TableHeader>
							<TableBody>
								{parts.map((p) => (
									<TableRow key={p.id} id={p.id}>
										<TableCell>{p.name}</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatQuantity(p)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Part>
				)}

				{photos.length > 0 && (
					<Part title={t("report.photos")}>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
							{photos.map((p) => (
								<figure key={p.id} className="grid gap-1.5 break-inside-avoid">
									<div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
										<PhotoImage
											db={db}
											id={p.id}
											alt={p.caption ?? t("order.photos.photo")}
										/>
									</div>
									{p.caption && (
										<figcaption className="text-sm text-muted-foreground">
											{p.caption}
										</figcaption>
									)}
								</figure>
							))}
						</div>
					</Part>
				)}

				<Part title={t("report.signature")}>
					{signature ? (
						<figure className="grid w-fit gap-2 break-inside-avoid">
							<div className="h-32 w-72 overflow-hidden rounded-xl border bg-white">
								<PhotoImage
									db={db}
									id={signature.id}
									alt={t("report.signatureAlt")}
									contain
								/>
							</div>
							<figcaption>
								<span className="font-medium">{signature.signer}</span>
								<span className="text-muted-foreground">
									{" "}
									· {day(signature.takenAt)} {time(signature.takenAt)}
								</span>
							</figcaption>
						</figure>
					) : (
						<p className="text-muted-foreground">{t("report.notSigned")}</p>
					)}
				</Part>
			</article>
		</div>
	);
}

function Part({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid content-start gap-2 break-inside-avoid">
			<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
				{title}
			</h2>
			{children}
		</section>
	);
}
