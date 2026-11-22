import {
	canAddPhoto,
	canChangePhoto,
	MAX_CAPTION,
	PHOTO,
} from "@fieldsync/work-orders";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, CloudOff, ImageOff, Trash2 } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { Section } from "@/components/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { ITEM_IN, ITEM_OUT, useLeaving } from "@/lib/use-leaving";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { addPhoto, type Photo, photosOf, shrink } from "../app/photos.ts";
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

/** The order's photos; taken offline, they upload once the network is back. */
export function OrderPhotos({ db, loop, user, orderId, order }: Props) {
	const { t, i18n } = useTranslation();
	const photos = useLiveQuery(
		async () => (await photosOf(db, orderId)).filter((p) => !p.signer),
		[db, orderId],
	);
	const members = useLiveQuery(() => db.getMeta<Member[]>("members"), [db]);
	const names = new Map(members?.map((m) => [m.id, m.name]));
	const caption = useSheet<Blob>();
	const viewer = useSheet<Photo>();
	// Kept while the viewer fades out.
	const open = viewer.value;
	const out = useLeaving();
	const [deleting, setDeleting] = useState(false);

	async function pick(event: ChangeEvent<HTMLInputElement>) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		try {
			caption.show(await shrink(file));
		} catch {
			toast.error(t("order.photos.unreadable"));
		}
	}

	function remove(photo: Photo) {
		viewer.hide();
		out.leave(
			photo.id,
			() =>
				void loop.mutate({
					entityType: PHOTO,
					entityId: photo.id,
					kind: "delete",
				}),
		);
	}

	const label = (p: Photo) => p.caption ?? t("order.photos.photo");

	return (
		<Section
			title={t("order.photos.title")}
			action={
				canAddPhoto(user, order) && (
					<label
						className={cn(
							buttonVariants({ variant: "outline" }),
							"cursor-pointer",
						)}
					>
						<Camera aria-hidden />
						{t("order.photos.add")}
						<input
							type="file"
							accept="image/*"
							capture="environment"
							aria-label={t("order.photos.add")}
							className="sr-only"
							onChange={(e) => void pick(e)}
						/>
					</label>
				)
			}
		>
			{photos?.length === 0 ? (
				<p className="text-muted-foreground">{t("order.photos.empty")}</p>
			) : (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{photos?.map((p) => (
						<li
							key={p.id}
							className={cn(
								"grid gap-1.5",
								ITEM_IN,
								out.isLeaving(p.id) && ITEM_OUT,
							)}
						>
							<button
								type="button"
								onClick={() => viewer.show(p)}
								aria-label={label(p)}
								className="aspect-square overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							>
								<PhotoImage db={db} id={p.id} alt={label(p)} />
							</button>
							{p.caption && (
								<p className="truncate text-sm text-muted-foreground">
									{p.caption}
								</p>
							)}
						</li>
					))}
				</ul>
			)}
			{caption.value && (
				<CaptionSheet
					key={caption.key}
					open={caption.open}
					image={caption.value}
					onClose={caption.hide}
					onSave={async (text) => {
						if (!caption.value) return;
						await addPhoto(db, loop, {
							orderId,
							user,
							image: caption.value,
							caption: text,
						});
						caption.hide();
					}}
				/>
			)}
			<Dialog
				isOpen={viewer.open}
				onOpenChange={(next) => !next && viewer.hide()}
				className="sm:max-w-3xl"
			>
				{open && (
					<>
						<DialogTitle className="pr-8 text-lg font-semibold">
							{label(open)}
						</DialogTitle>
						<div className="overflow-hidden rounded-xl bg-muted">
							<PhotoImage db={db} id={open.id} alt={label(open)} contain />
						</div>
						<p className="text-muted-foreground">
							{t("order.photos.by", {
								name: names.get(open.takenBy) ?? t("values.someone"),
								when: new Date(open.takenAt).toLocaleString(i18n.language),
							})}
						</p>
						{canChangePhoto(user, order, open) && (
							<Button
								variant="destructive"
								className="justify-self-start"
								onPress={() => setDeleting(true)}
							>
								<Trash2 aria-hidden />
								{t("order.photos.delete")}
							</Button>
						)}
					</>
				)}
			</Dialog>
			<Confirm
				open={deleting}
				onOpenChange={setDeleting}
				title={t("order.photos.deleteTitle")}
				description={open ? label(open) : ""}
				confirmLabel={t("order.photos.delete")}
				onConfirm={() => open && remove(open)}
			/>
		</Section>
	);
}

function CaptionSheet({
	open,
	image,
	onClose,
	onSave,
}: {
	open: boolean;
	image: Blob;
	onClose: () => void;
	onSave: (caption: string | null) => Promise<void>;
}) {
	const { t } = useTranslation();
	const [caption, setCaption] = useState("");
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(image);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [image]);
	return (
		<FormSheet
			open={open}
			onOpenChange={(next) => !next && onClose()}
			title={t("order.photos.saveTitle")}
			submitLabel={t("common.save")}
			onSubmit={() => void onSave(caption.trim() || null)}
		>
			{url && (
				<img
					src={url}
					alt=""
					className="max-h-72 w-full rounded-xl bg-muted object-contain"
				/>
			)}
			<TextField
				id="photo-caption"
				label={t("order.photos.caption")}
				placeholder={t("order.photos.captionPlaceholder")}
				maxLength={MAX_CAPTION}
				value={caption}
				onChange={setCaption}
			/>
		</FormSheet>
	);
}

/** The image from this device, or why it is not here yet. */
export function PhotoImage({
	db,
	id,
	alt,
	contain,
}: {
	db: LocalDb;
	id: string;
	alt: string;
	contain?: boolean;
}) {
	const { t } = useTranslation();
	const file = useLiveQuery(() => db.files.get(id), [db, id]);
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) return setUrl(null);
		const next = URL.createObjectURL(
			new Blob([file.bytes], { type: file.type }),
		);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);

	if (!url) {
		return (
			<span className="grid size-full min-h-32 place-items-center gap-1 p-3 text-center text-sm text-muted-foreground">
				<ImageOff aria-hidden className="size-6" />
				{t("order.photos.notHere")}
			</span>
		);
	}
	return (
		<span className="relative block size-full">
			<img
				src={url}
				alt={alt}
				className={cn(
					"size-full",
					contain ? "max-h-[70vh] object-contain" : "object-cover",
				)}
			/>
			{file?.uploaded === 0 && (
				<span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-warning">
					<CloudOff aria-hidden className="size-3.5" />
					{t("order.photos.notSynced")}
				</span>
			)}
		</span>
	);
}
