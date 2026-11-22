import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CheckCheck, GitMerge, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Offline } from "@/components/offline";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
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
	const client = useQueryClient();
	const [showReviewed, setShowReviewed] = useState(false);
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

	async function review(id: string) {
		try {
			await apiFetch(session, `/conflicts/${id}/review`, { method: "POST" });
			toast.success(t("conflicts.reviewedToast"));
			await client.invalidateQueries({ queryKey: ["conflicts"] });
		} catch (e) {
			toast.error(messageFor(e));
		}
	}

	const side = (kind: "kept" | "overwritten", field: string, s: Side) => (
		<div
			className={cn(
				"grid gap-1 rounded-xl border p-4",
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
					kind === "overwritten" && "text-muted-foreground line-through",
				)}
			>
				{describeValue(field, s.value, names)}
			</span>
			<span className="text-sm text-muted-foreground">
				{t("conflicts.by", {
					name: s.by ?? t("conflicts.unknownDevice"),
					when: when(s.at),
				})}
			</span>
		</div>
	);

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
			) : (
				<ul className="grid gap-4">
					{conflicts.data?.map((c) => (
						<li
							key={c.id}
							className="grid gap-4 rounded-2xl border bg-card p-6"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="grid gap-1">
									<a
										href={ROUTES.order(c.entityId)}
										className="text-lg font-semibold text-foreground hover:underline"
									>
										{c.title ?? t("conflicts.deletedOrder")}
									</a>
									<p className="text-muted-foreground">
										{t(`conflicts.${c.reason}`)}
									</p>
								</div>
								<span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
									{fieldLabel(c.field)}
								</span>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								{side("kept", c.field, c.winner)}
								{side("overwritten", c.field, c.loser)}
							</div>
							{c.reviewedAt ? (
								<p className="text-sm text-muted-foreground">
									{t("conflicts.reviewed", {
										name: c.reviewedBy ?? "",
										when: when(c.reviewedAt),
									})}
								</p>
							) : (
								<Button
									className="justify-self-start"
									onPress={() => void review(c.id)}
								>
									<Check aria-hidden />
									{t("conflicts.review")}
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
