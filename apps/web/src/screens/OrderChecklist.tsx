import {
	CHECKLIST_ITEM,
	canManage,
	MAX_ITEM_LABEL,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ITEM_IN, ITEM_OUT, useLeaving } from "@/lib/use-leaving";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { type Item, itemsOf } from "../app/checklists.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	orderId: string;
	order: Record<string, unknown>;
};

/** Steps the office sets for the job; the technician ticks them, offline too. */
export function OrderChecklist({ db, loop, user, orderId, order }: Props) {
	const { t } = useTranslation();
	const items = useLiveQuery(() => itemsOf(db, orderId), [db, orderId]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const add = useSheet<true>();
	const out = useLeaving();
	// The tick shows at once, until the stored value catches up; after that,
	// changes from other devices show again.
	const [ticked, setTicked] = useState<Record<string, boolean>>({});
	useEffect(() => {
		setTicked((current) => {
			const stored = new Map(items?.map((i) => [i.id, i.done]));
			const left = Object.entries(current).filter(
				([id, v]) => stored.get(id) !== v,
			);
			return left.length === Object.keys(current).length
				? current
				: Object.fromEntries(left);
		});
	}, [items]);
	const office = canManage(user.role);
	const canTick = office || order.assigneeId === user.id;

	if (!items) return null;
	if (items.length === 0 && !office) return null;
	const done = items.filter((i) => i.done).length;

	const write = (
		id: string,
		patch: Record<string, string | number | boolean | null>,
	) => loop.mutate({ entityType: CHECKLIST_ITEM, entityId: id, patch });

	function tick(item: Item, checked: boolean) {
		setTicked((current) => ({ ...current, [item.id]: checked }));
		void write(item.id, {
			done: checked,
			doneBy: checked ? user.id : null,
			doneAt: checked ? new Date().toISOString() : null,
		});
	}

	return (
		<Section
			title={t("order.checklist.title")}
			aside={
				items.length > 0 &&
				t("order.checklist.progress", { done, total: items.length })
			}
			action={
				office && (
					<Button variant="outline" onPress={() => add.show(true)}>
						<Plus aria-hidden />
						{t("order.checklist.add")}
					</Button>
				)
			}
		>
			{items.length > 0 && (
				<div className="h-2 overflow-hidden rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-status-done transition-all"
						style={{ width: `${(done / items.length) * 100}%` }}
					/>
				</div>
			)}
			{items.length === 0 ? (
				<p className="text-muted-foreground">{t("order.checklist.empty")}</p>
			) : (
				<ul className="-mx-2 grid">
					{items.map((item) => {
						const checked = ticked[item.id] ?? item.done;
						return (
							<li
								key={item.id}
								className={cn(
									"flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-muted/50",
									ITEM_IN,
									out.isLeaving(item.id) && ITEM_OUT,
								)}
							>
								<Checkbox
									isSelected={checked}
									isDisabled={!canTick}
									onChange={(next) => tick(item, next)}
									className="flex-1 gap-3 py-2 text-base"
								>
									<span
										className={cn(
											checked && "text-muted-foreground line-through",
										)}
									>
										{item.label}
									</span>
								</Checkbox>
								{item.done && item.doneBy && (
									<span className="text-sm text-muted-foreground">
										{t("order.checklist.doneBy", {
											name: names.get(item.doneBy) ?? t("values.someone"),
										})}
									</span>
								)}
								{office && (
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("order.checklist.remove", {
											label: item.label,
										})}
										onPress={() =>
											out.leave(
												item.id,
												() =>
													void loop.mutate({
														entityType: CHECKLIST_ITEM,
														entityId: item.id,
														kind: "delete",
													}),
											)
										}
									>
										<X aria-hidden />
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{add.value && (
				<AddStep
					key={add.key}
					open={add.open}
					onClose={add.hide}
					onAdd={(label) =>
						void write(crypto.randomUUID(), {
							orderId,
							label,
							position: (items.at(-1)?.position ?? 0) + 1,
						})
					}
				/>
			)}
		</Section>
	);
}

/** Stays open after each step, so several can be added in a row. */
function AddStep({
	open,
	onClose,
	onAdd,
}: {
	open: boolean;
	onClose: () => void;
	onAdd: (label: string) => void;
}) {
	const { t } = useTranslation();
	const [label, setLabel] = useState("");
	const [error, setError] = useState<string | null>(null);
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("order.checklist.add")}
			submitLabel={t("order.checklist.add")}
			onSubmit={() => {
				const text = label.trim();
				if (!text) return setError(t("order.checklist.stepRequired"));
				onAdd(text);
				setLabel("");
			}}
		>
			<TextField
				id="checklist-step"
				label={t("order.checklist.step")}
				placeholder={t("order.checklist.stepPlaceholder")}
				required
				maxLength={MAX_ITEM_LABEL}
				value={label}
				onChange={(v) => {
					setError(null);
					setLabel(v);
				}}
				error={error}
			/>
		</FormSheet>
	);
}
