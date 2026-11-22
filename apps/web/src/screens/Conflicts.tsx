import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import {
	ArrowRight,
	Check,
	CheckCheck,
	ChevronRight,
	GitMerge,
	History,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { columnHelper, DataTable } from "@/components/data-table";
import { DetailSheet, sheetAction } from "@/components/form-sheet";
import { Offline } from "@/components/offline";
import { PageHeader } from "@/components/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { usePhone } from "@/lib/use-phone";
import { cn } from "@/lib/utils";
import { messageFor } from "../app/errors.ts";
import { ROUTES } from "../app/route.ts";
import { apiFetch, type Member } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";
import { describeValue, fieldLabel } from "../orders.ts";
import type { LocalDb } from "../sync/storage.ts";

type Side = { value: unknown; at: number; by: string | null };

type Conflict = {
	id: string;
	entityId: string;
	title: string | null;
	field: string;
	reason: "concurrent_edit" | "edit_on_deleted";
	winner: Side;
	loser: Side;
	reviewedAt: string | null;
	reviewedBy: string | null;
};

/** Edits the sync engine had to choose between, for the office to check. */
export function Conflicts({ db, session }: { db: LocalDb; session: Session }) {
	const { t, i18n } = useTranslation();
	const phone = usePhone();
	const client = useQueryClient();
	const [showReviewed, setShowReviewed] = useState(false);
	const [open, setOpen] = useState<Conflict | null>(null);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const conflicts = useQuery({
		queryKey: ["conflicts", showReviewed],
		queryFn: async () =>
			(
				await apiFetch<{ conflicts: Conflict[] }>(
					session,
					`/conflicts?open=${!showReviewed}`,
				)
			)?.conflicts ?? [],
	});
	const when = (at: number | string) =>
		new Intl.DateTimeFormat(i18n.language, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(at));
	const value = (c: Conflict, side: Side) =>
		describeValue(c.field, side.value, names);
	const title = (c: Conflict) => c.title ?? t("conflicts.deletedOrder");

	async function review(id: string) {
		try {
			await apiFetch(session, `/conflicts/${id}/review`, { method: "POST" });
			toast.success(t("conflicts.reviewedToast"));
			setOpen(null);
			await client.invalidateQueries({ queryKey: ["conflicts"] });
		} catch (e) {
			toast.error(messageFor(e));
		}
	}

	const helper = columnHelper<Conflict>();
	const columns = helper.columns([
		helper.accessor((c) => title(c), {
			id: "order",
			header: t("conflicts.order"),
			cell: ({ row }) => (
				<span className="grid gap-0.5">
					<span className="font-medium">{title(row.original)}</span>
					<span className="text-sm text-muted-foreground">
						{t(`conflicts.${row.original.reason}`)}
					</span>
				</span>
			),
			meta: { className: "whitespace-normal" },
		}),
		helper.accessor((c) => fieldLabel(c.field), {
			id: "field",
			header: t("conflicts.field"),
		}),
		helper.display({
			id: "values",
			header: t("conflicts.values"),
			cell: ({ row }) => (
				<span className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-status-done">
						{value(row.original, row.original.winner)}
					</span>
					<span className="text-muted-foreground line-through">
						{value(row.original, row.original.loser)}
					</span>
				</span>
			),
		}),
		helper.accessor((c) => c.winner.at, {
			id: "when",
			header: t("conflicts.when"),
			cell: ({ row }) => when(row.original.winner.at),
		}),
		helper.display({
			id: "state",
			header: t("conflicts.state"),
			cell: ({ row }) => <State conflict={row.original} />,
		}),
	]);

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("conflicts.title")}
				description={t("conflicts.description")}
				actions={
					<Toggle
						variant="outline"
						isSelected={showReviewed}
						onChange={setShowReviewed}
						className="bg-card data-selected:border-primary/40 data-selected:bg-accent data-selected:text-accent-foreground"
					>
						<CheckCheck aria-hidden />
						{t("conflicts.showReviewed")}
					</Toggle>
				}
			/>
			{conflicts.isError ? (
				<Offline
					text={t("conflicts.offline")}
					onRetry={() => void conflicts.refetch()}
				/>
			) : conflicts.data?.length === 0 ? (
				<div className="grid place-items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
					<GitMerge aria-hidden className="size-8 text-muted-foreground" />
					<p className="font-medium">{t("conflicts.none")}</p>
				</div>
			) : phone ? (
				<ul className="grid gap-2.5">
					{conflicts.data?.map((c) => (
						<li key={c.id}>
							<button
								type="button"
								onClick={() => setOpen(c)}
								className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left"
							>
								<span className="grid min-w-0 flex-1 gap-1.5">
									<span className="truncate font-semibold">{title(c)}</span>
									<span className="flex flex-wrap items-center gap-2 text-sm">
										<span className="rounded-full bg-muted px-2.5 py-0.5">
											{fieldLabel(c.field)}
										</span>
										<State conflict={c} />
									</span>
								</span>
								<ChevronRight
									aria-hidden
									className="size-5 shrink-0 text-muted-foreground"
								/>
							</button>
						</li>
					))}
				</ul>
			) : (
				<DataTable
					label={t("conflicts.title")}
					data={conflicts.data ?? []}
					columns={columns}
					getRowId={(c) => c.id}
					onRowAction={setOpen}
					empty={t("conflicts.none")}
				/>
			)}
			{open && (
				<DetailSheet
					open
					onOpenChange={(next) => !next && setOpen(null)}
					title={t("conflicts.detailTitle", { field: fieldLabel(open.field) })}
					description={`${title(open)} · ${t(`conflicts.${open.reason}`)}`}
					actions={
						<>
							<LinkButton
								href={ROUTES.order(open.entityId)}
								variant="outline"
								className={sheetAction}
							>
								{t("conflicts.openOrder")}
								<ArrowRight aria-hidden />
							</LinkButton>
							{!open.reviewedAt && (
								<Button
									className={sheetAction}
									onPress={() => void review(open.id)}
								>
									<Check aria-hidden />
									{t("conflicts.review")}
								</Button>
							)}
						</>
					}
				>
					{(["kept", "overwritten"] as const).map((kind) => {
						const side = kind === "kept" ? open.winner : open.loser;
						return (
							<div
								key={kind}
								className={cn(
									"grid gap-1.5 rounded-xl border p-4",
									kind === "kept"
										? "border-status-done/30 bg-status-done/5"
										: "border-destructive/20 bg-destructive/5",
								)}
							>
								<span
									className={cn(
										"flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
										kind === "kept" ? "text-status-done" : "text-destructive",
									)}
								>
									{kind === "kept" ? (
										<Check aria-hidden className="size-4" />
									) : (
										<History aria-hidden className="size-4" />
									)}
									{t(`conflicts.${kind}`)}
								</span>
								<span
									className={cn(
										"text-lg font-medium break-words",
										kind === "overwritten" &&
											"text-muted-foreground line-through",
									)}
								>
									{value(open, side)}
								</span>
								<span className="text-sm text-muted-foreground">
									{t("conflicts.by", {
										name: side.by ?? t("conflicts.unknownDevice"),
										when: when(side.at),
									})}
								</span>
							</div>
						);
					})}
					{open.reviewedAt && (
						<p className="text-muted-foreground">
							{t("conflicts.reviewed", {
								name: open.reviewedBy ?? "",
								when: when(open.reviewedAt),
							})}
						</p>
					)}
				</DetailSheet>
			)}
		</div>
	);
}

function State({ conflict }: { conflict: Conflict }) {
	const { t } = useTranslation();
	return conflict.reviewedAt ? (
		<span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">
			{t("conflicts.seen")}
		</span>
	) : (
		<span className="inline-flex rounded-full bg-warning/15 px-2.5 py-0.5 text-sm font-medium text-warning">
			{t("conflicts.toReview")}
		</span>
	);
}
