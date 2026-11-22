import type { EntityState } from "@fieldsync/merge";
import {
	canManage,
	editableFields,
	FIELDS,
	type Field,
	MAX_LENGTH,
	PRIORITIES,
	STATUSES,
	WORK_ORDER,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { TextAreaField, TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { SelectField } from "@/components/select-field";
import { itemsOf } from "../app/checklists.ts";
import { sitesOf } from "../app/sites.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import {
	type Draft,
	patchOf,
	priorityLabel,
	statusLabel,
	toDraft,
} from "../orders.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	/** Null to create one. */
	order: { id: string; state: EntityState } | null;
};

/** Select keys cannot be empty; "no site" and "unassigned" use this one. */
const NONE = "none";
const fromKey = (key: string) => (key === NONE ? "" : key);

/** Creates or edits a work order; shows only the fields this user may change. */
export function OrderSheet({
	open,
	onOpenChange,
	db,
	loop,
	user,
	order,
}: Props) {
	const { t } = useTranslation();
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const sites = useLiveQuery(() => sitesOf(db), [db]);
	const unticked = useLiveQuery(
		async () =>
			order ? (await itemsOf(db, order.id)).filter((i) => !i.done).length : 0,
		[db, order?.id],
	);
	const live = toDraft(order?.state ?? null);
	const [edits, setEdits] = useState<Partial<Draft>>(() =>
		order ? {} : { priority: "normal" },
	);
	const [error, setError] = useState<string | null>(null);
	const draft: Draft = { ...live, ...edits };
	const editable: ReadonlySet<Field> = order
		? editableFields(user, order.state.fields)
		: new Set(canManage(user.role) ? FIELDS : []);
	const set = (field: Field) => (value: string) =>
		setEdits((e) => ({ ...e, [field]: value }));
	const max = (field: Field) =>
		(MAX_LENGTH as Partial<Record<Field, number>>)[field];

	async function save() {
		if (!draft.title.trim()) return setError(t("order.form.titleRequired"));
		const patch = patchOf(live, draft, editable);
		if (!order && !draft.status) {
			patch.status = draft.assigneeId ? "assigned" : "open";
		}
		if (Object.keys(patch).length > 0) {
			await loop.mutate({
				entityType: WORK_ORDER,
				entityId: order?.id ?? crypto.randomUUID(),
				patch,
			});
		}
		if (draft.status === "done" && (unticked ?? 0) > 0) {
			toast.warning(t("order.unticked", { count: unticked }));
		}
		toast.success(order ? t("order.saved") : t("order.created"));
		onOpenChange(false);
	}

	// Disabled technicians keep their name on past orders but get no new ones.
	const technicians =
		members?.filter(
			(m) =>
				m.role === "technician" &&
				(m.active !== false || m.id === draft.assigneeId),
		) ?? [];
	const siteOptions = [
		{ value: NONE, label: t("order.noSite") },
		...(sites ?? []).map((s) => ({ value: s.id, label: s.name })),
	];
	const pickSite = (siteId: string) => {
		const address = sites?.find((s) => s.id === siteId)?.address;
		setEdits((e) => ({ ...e, siteId, ...(address ? { address } : {}) }));
	};

	return (
		<FormSheet
			open={open}
			onOpenChange={onOpenChange}
			title={order ? t("order.form.editTitle") : t("order.form.newTitle")}
			submitLabel={t("common.save")}
			onSubmit={() => void save()}
		>
			{editable.has("title") && (
				<TextField
					id="order-title"
					label={t("order.form.title")}
					placeholder={t("order.form.titlePlaceholder")}
					required
					maxLength={max("title")}
					value={draft.title}
					onChange={(v) => {
						setError(null);
						set("title")(v);
					}}
					error={error}
				/>
			)}
			{editable.has("description") && (
				<TextAreaField
					id="order-description"
					label={t("order.form.description")}
					placeholder={t("order.form.descriptionPlaceholder")}
					maxLength={max("description")}
					value={draft.description}
					onChange={set("description")}
				/>
			)}
			{editable.has("siteId") && (
				<SelectField
					id="order-site"
					label={t("order.form.site")}
					placeholder={t("order.form.sitePlaceholder")}
					hint={t("order.form.siteHint")}
					options={siteOptions}
					value={draft.siteId || NONE}
					onChange={(key) => pickSite(fromKey(key))}
				/>
			)}
			{editable.has("address") && (
				<TextField
					id="order-address"
					label={t("order.form.address")}
					placeholder={t("order.form.addressPlaceholder")}
					maxLength={max("address")}
					value={draft.address}
					onChange={set("address")}
				/>
			)}
			{(editable.has("priority") || editable.has("dueDate")) && (
				<div className="grid gap-6 sm:grid-cols-2">
					{editable.has("priority") && (
						<SelectField
							id="order-priority"
							label={t("order.form.priority")}
							placeholder={t("order.form.priorityPlaceholder")}
							options={PRIORITIES.map((p) => ({
								value: p,
								label: priorityLabel(p),
							}))}
							value={draft.priority}
							onChange={set("priority")}
						/>
					)}
					{editable.has("dueDate") && (
						<DateField
							id="order-due"
							label={t("order.form.due")}
							clearLabel={t("order.form.clearDate")}
							value={draft.dueDate}
							onChange={set("dueDate")}
						/>
					)}
				</div>
			)}
			{editable.has("assigneeId") && (
				<SelectField
					id="order-assignee"
					label={t("order.form.assignee")}
					placeholder={t("order.form.assigneePlaceholder")}
					options={[
						{ value: NONE, label: t("orders.unassigned") },
						...technicians.map((m) => ({ value: m.id, label: m.name })),
					]}
					value={draft.assigneeId || NONE}
					onChange={(key) => set("assigneeId")(fromKey(key))}
				/>
			)}
			{order && editable.has("status") && (
				<SelectField
					id="order-status"
					label={t("order.form.status")}
					placeholder={t("order.form.statusPlaceholder")}
					options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
					value={draft.status}
					onChange={set("status")}
					hint={
						draft.status === "done" && (unticked ?? 0) > 0
							? t("order.unticked", { count: unticked })
							: undefined
					}
				/>
			)}
			{editable.has("notes") && (
				<TextAreaField
					id="order-notes"
					label={t("order.form.notes")}
					placeholder={t("order.form.notesPlaceholder")}
					maxLength={max("notes")}
					rows={4}
					value={draft.notes}
					onChange={set("notes")}
				/>
			)}
		</FormSheet>
	);
}
