import {
	canManage,
	MAX_PART_NAME,
	MAX_QUANTITY,
	MAX_UNIT,
	PART,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
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
	const all = useLiveQuery(() => partsOf(db), [db]);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [unit, setUnit] = useState("");
	const [error, setError] = useState<string | null>(null);
	const office = canManage(user.role);
	const canAdd = office || order.assigneeId === user.id;

	if (!all) return null;
	const parts = all.filter((p) => p.orderId === orderId);
	if (parts.length === 0 && !canAdd) return null;

	function add(event: FormEvent) {
		event.preventDefault();
		const amount = Number(quantity);
		if (!name.trim()) return setError("Name the part.");
		if (!(amount > 0 && amount <= MAX_QUANTITY)) {
			return setError("Enter a quantity above 0.");
		}
		setError(null);
		void loop.mutate({
			entityType: PART,
			entityId: crypto.randomUUID(),
			patch: {
				orderId,
				name: name.trim(),
				quantity: amount,
				unit: unit.trim() || null,
				addedBy: user.id,
				addedAt: new Date().toISOString(),
			},
		});
		setName("");
		setQuantity("1");
	}

	return (
		<section className="card parts">
			<h3>Parts and materials</h3>
			{parts.length === 0 && <p className="muted">None recorded.</p>}
			<ul className="items">
				{parts.map((p) => (
					<li key={p.id}>
						<span>
							<strong>{formatQuantity(p)}</strong> {p.name}
						</span>
						<span className="muted meta">
							{names.get(p.addedBy) ?? "Someone"}
						</span>
						{(office || (canAdd && p.addedBy === user.id)) && (
							<button
								type="button"
								className="link"
								aria-label={`Remove ${p.name}`}
								onClick={() =>
									void loop.mutate({
										entityType: PART,
										entityId: p.id,
										kind: "delete",
									})
								}
							>
								Remove
							</button>
						)}
					</li>
				))}
			</ul>
			{canAdd && (
				<form className="add-part" onSubmit={add}>
					<input
						aria-label="Part"
						placeholder="Part, like “Pump seal 32 mm”"
						list="part-names"
						maxLength={MAX_PART_NAME}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<datalist id="part-names">
						{partNames(all).map((n) => (
							<option key={n} value={n} />
						))}
					</datalist>
					<input
						aria-label="Quantity"
						type="number"
						inputMode="decimal"
						min="0"
						step="any"
						value={quantity}
						onChange={(e) => setQuantity(e.target.value)}
					/>
					<input
						aria-label="Unit"
						placeholder="Unit"
						list="part-units"
						maxLength={MAX_UNIT}
						value={unit}
						onChange={(e) => setUnit(e.target.value)}
					/>
					<datalist id="part-units">
						{UNITS.map((u) => (
							<option key={u} value={u} />
						))}
					</datalist>
					<button type="submit">Add part</button>
				</form>
			)}
			{error && (
				<p role="alert" className="error">
					{error}
				</p>
			)}
		</section>
	);
}
