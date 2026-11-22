import {
	canManage,
	MAX_PART_NAME,
	MAX_QUANTITY,
	MAX_UNIT,
	PART,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { Package, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ComboField } from "@/components/combo-field";
import { TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { useSheet } from "@/lib/use-sheet";
import { formatQuantity, partNames, partsOf } from "../app/parts.ts";
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

const UNITS = ["pcs", "m", "L", "kg"];

/** Parts and materials used on the job, recorded on site, offline too. */
export function OrderParts({ db, loop, user, orderId, order }: Props) {
	const { t } = useTranslation();
	const all = useLiveQuery(() => partsOf(db), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const add = useSheet<true>();
	const office = canManage(user.role);
	const canAdd = office || order.assigneeId === user.id;

	if (!all) return null;
	const parts = all.filter((p) => p.orderId === orderId);
	if (parts.length === 0 && !canAdd) return null;

	return (
		<Section
			title={t("order.parts.title")}
			action={
				canAdd && (
					<Button variant="outline" onPress={() => add.show(true)}>
						<Plus aria-hidden />
						{t("order.parts.add")}
					</Button>
				)
			}
		>
			{parts.length === 0 ? (
				<p className="text-muted-foreground">{t("order.parts.empty")}</p>
			) : (
				<ul className="grid divide-y">
					{parts.map((p) => (
						<li key={p.id} className="flex items-center gap-3 py-3">
							<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
								<Package aria-hidden className="size-5" />
							</span>
							<span className="grid min-w-0 flex-1">
								<span className="truncate font-medium">
									<span className="tabular-nums">{formatQuantity(p)}</span>{" "}
									{p.name}
								</span>
								<span className="text-sm text-muted-foreground">
									{names.get(p.addedBy) ?? t("values.someone")}
								</span>
							</span>
							{(office || (canAdd && p.addedBy === user.id)) && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t("order.parts.remove", { name: p.name })}
									onPress={() =>
										void loop.mutate({
											entityType: PART,
											entityId: p.id,
											kind: "delete",
										})
									}
								>
									<X aria-hidden />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{add.value && (
				<AddPart
					key={add.key}
					open={add.open}
					suggestions={partNames(all)}
					onClose={add.hide}
					onAdd={(part) =>
						void loop.mutate({
							entityType: PART,
							entityId: crypto.randomUUID(),
							patch: {
								orderId,
								...part,
								addedBy: user.id,
								addedAt: new Date().toISOString(),
							},
						})
					}
				/>
			)}
		</Section>
	);
}

function AddPart({
	open,
	suggestions,
	onClose,
	onAdd,
}: {
	open: boolean;
	suggestions: string[];
	onClose: () => void;
	onAdd: (part: {
		name: string;
		quantity: number;
		unit: string | null;
	}) => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [unit, setUnit] = useState("");
	const [errors, setErrors] = useState<{ name?: string; quantity?: string }>(
		{},
	);

	function submit() {
		const amount = Number(quantity.replace(",", "."));
		const next = {
			name: name.trim() ? undefined : t("order.parts.nameRequired"),
			quantity:
				amount > 0 && amount <= MAX_QUANTITY
					? undefined
					: t("order.parts.quantityInvalid"),
		};
		setErrors(next);
		if (next.name || next.quantity) return;
		onAdd({ name: name.trim(), quantity: amount, unit: unit.trim() || null });
		toast.success(
			`${formatQuantity({ quantity: amount, unit: unit.trim() || null })} ${name.trim()}`,
		);
		onClose();
	}

	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("order.parts.add")}
			submitLabel={t("order.parts.add")}
			onSubmit={submit}
		>
			<ComboField
				id="part-name"
				label={t("order.parts.name")}
				placeholder={t("order.parts.namePlaceholder")}
				suggestions={suggestions}
				required
				maxLength={MAX_PART_NAME}
				value={name}
				onChange={setName}
				error={errors.name}
			/>
			<div className="grid grid-cols-2 gap-4">
				<TextField
					id="part-quantity"
					label={t("order.parts.quantity")}
					placeholder={t("order.parts.quantityPlaceholder")}
					required
					inputMode="decimal"
					value={quantity}
					onChange={setQuantity}
					error={errors.quantity}
				/>
				<ComboField
					id="part-unit"
					label={t("order.parts.unit")}
					placeholder={t("order.parts.unitPlaceholder")}
					suggestions={UNITS}
					maxLength={MAX_UNIT}
					value={unit}
					onChange={setUnit}
				/>
			</div>
		</FormSheet>
	);
}
