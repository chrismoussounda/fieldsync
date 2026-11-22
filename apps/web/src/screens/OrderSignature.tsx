import { canAddPhoto, MAX_SIGNER } from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { Eraser, PenLine } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addPhoto, photosOf } from "../app/photos.ts";
import type { Member } from "../app/workspace.ts";
import type { User } from "../auth/session.ts";
import type { SyncLoop } from "../sync/loop.ts";
import type { LocalDb } from "../sync/storage.ts";
import { PhotoImage } from "./OrderPhotos.tsx";

type Props = {
	db: LocalDb;
	loop: SyncLoop;
	user: User;
	orderId: string;
	order: Record<string, unknown>;
};

/** The customer signs on the screen when the job is done; saved like a photo. */
export function OrderSignature({ db, loop, user, orderId, order }: Props) {
	const { t, i18n } = useTranslation();
	const signatures = useLiveQuery(
		async () => (await photosOf(db, orderId)).filter((p) => p.signer),
		[db, orderId],
	);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const [signing, setSigning] = useState(false);
	const allowed = canAddPhoto(user, order);

	if (!signatures) return null;
	if (signatures.length === 0 && !allowed) return null;
	const latest = signatures.at(-1);

	return (
		<Section
			title={t("order.signature.title")}
			action={
				allowed && (
					<Button
						variant={latest ? "outline" : "default"}
						onPress={() => setSigning(true)}
					>
						<PenLine aria-hidden />
						{latest ? t("order.signature.again") : t("order.signature.sign")}
					</Button>
				)
			}
		>
			{latest ? (
				<figure className="grid gap-3">
					<div className="h-36 overflow-hidden rounded-xl border bg-white">
						<PhotoImage
							db={db}
							id={latest.id}
							alt={t("order.signature.signedBy", { name: latest.signer })}
							contain
						/>
					</div>
					<figcaption className="grid gap-0.5">
						<span className="font-medium">
							{t("order.signature.signedBy", { name: latest.signer })}
						</span>
						<span className="text-sm text-muted-foreground">
							{t("order.signature.with", {
								when: new Date(latest.takenAt).toLocaleString(i18n.language),
								name: names.get(latest.takenBy) ?? t("values.someone"),
							})}
						</span>
					</figcaption>
				</figure>
			) : (
				<p className="text-muted-foreground">{t("order.signature.empty")}</p>
			)}
			{signing && (
				<SignSheet
					onClose={() => setSigning(false)}
					onSave={async (image, signer) => {
						await addPhoto(db, loop, { orderId, user, image, signer });
						toast.success(t("order.signature.signedBy", { name: signer }));
						setSigning(false);
					}}
				/>
			)}
		</Section>
	);
}

function SignSheet({
	onSave,
	onClose,
}: {
	onSave: (image: Blob, signer: string) => Promise<void>;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const canvas = useRef<HTMLCanvasElement>(null);
	const last = useRef<{ x: number; y: number } | null>(null);
	const [drawn, setDrawn] = useState(false);
	const [signer, setSigner] = useState("");
	const [busy, setBusy] = useState(false);

	// The canvas is drawn at a fixed size and scaled by CSS.
	const point = (e: PointerEvent<HTMLCanvasElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		return {
			x: ((e.clientX - box.left) * e.currentTarget.width) / box.width,
			y: ((e.clientY - box.top) * e.currentTarget.height) / box.height,
		};
	};

	function down(e: PointerEvent<HTMLCanvasElement>) {
		e.currentTarget.setPointerCapture(e.pointerId);
		last.current = point(e);
	}

	function move(e: PointerEvent<HTMLCanvasElement>) {
		const from = last.current;
		const ctx = e.currentTarget.getContext("2d");
		if (!from || !ctx) return;
		const to = point(e);
		ctx.lineWidth = 3;
		ctx.lineCap = "round";
		// The pad stays white in dark mode, so the ink stays dark.
		ctx.strokeStyle = "#17201c";
		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(to.x, to.y);
		ctx.stroke();
		last.current = to;
		setDrawn(true);
	}

	function clear() {
		const c = canvas.current;
		c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
		setDrawn(false);
	}

	async function save() {
		const c = canvas.current;
		if (!c || !drawn || !signer.trim()) return;
		setBusy(true);
		const image = await new Promise<Blob | null>((done) =>
			c.toBlob(done, "image/png"),
		);
		if (image) await onSave(image, signer.trim());
		setBusy(false);
	}

	return (
		<FormSheet
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("order.signature.sign")}
			description={t("order.signature.padHint")}
			submitLabel={t("order.signature.save")}
			busy={busy || !drawn || !signer.trim()}
			onSubmit={() => void save()}
		>
			<div className="grid gap-2">
				<div className="flex items-center justify-between">
					<Label>{t("order.signature.pad")}</Label>
					<Button variant="ghost" size="sm" onPress={clear}>
						<Eraser aria-hidden />
						{t("order.signature.clear")}
					</Button>
				</div>
				<canvas
					ref={canvas}
					width={600}
					height={240}
					aria-label={t("order.signature.pad")}
					onPointerDown={down}
					onPointerMove={move}
					onPointerUp={() => {
						last.current = null;
					}}
					className="aspect-[5/2] w-full touch-none rounded-xl border-2 border-dashed border-input bg-white"
				/>
			</div>
			<TextField
				id="signer"
				label={t("order.signature.name")}
				placeholder={t("order.signature.namePlaceholder")}
				required
				maxLength={MAX_SIGNER}
				value={signer}
				onChange={setSigner}
			/>
		</FormSheet>
	);
}
