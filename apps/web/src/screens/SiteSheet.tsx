import {
	isValidSitePatch,
	type Location,
	MAX_SITE_LENGTH,
	SITE,
} from "@fieldsync/work-orders";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TextAreaField, TextField } from "@/components/fields";
import { FormSheet } from "@/components/form-sheet";
import { LocationField } from "@/components/map";
import type { Site } from "../app/sites.ts";
import type { SyncLoop } from "../sync/loop.ts";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	loop: SyncLoop;
	/** Null to create one. */
	site: Site | null;
};

const EMPTY = {
	name: "",
	address: "",
	contactName: "",
	contactPhone: "",
	accessNotes: "",
};
type Text = typeof EMPTY;
type Values = Text & { location: Location | null };

export function SiteSheet({ open, onOpenChange, loop, site }: Props) {
	const { t } = useTranslation();
	const start: Values = site
		? {
				name: site.name,
				address: site.address,
				contactName: site.contactName,
				contactPhone: site.contactPhone,
				accessNotes: site.accessNotes,
				location: site.location,
			}
		: { ...EMPTY, location: null };
	const form = useForm({
		defaultValues: start,
		onSubmit: async ({ value }) => {
			const patch: Record<string, string | Location | null> = {};
			for (const key of Object.keys(EMPTY) as (keyof Text)[]) {
				const next = value[key].trim();
				if (next !== start[key]) patch[key] = next || null;
			}
			if (value.location !== start.location) patch.location = value.location;
			if (Object.keys(patch).length > 0) {
				await loop.mutate({
					entityType: SITE,
					entityId: site?.id ?? crypto.randomUUID(),
					patch,
				});
			}
			toast.success(t("sites.saved"));
			onOpenChange(false);
		},
	});

	return (
		<FormSheet
			open={open}
			onOpenChange={onOpenChange}
			title={site ? t("sites.editTitle") : t("sites.new")}
			submitLabel={t("common.save")}
			onSubmit={() => void form.handleSubmit()}
		>
			<form.Field
				name="name"
				validators={{
					onSubmit: ({ value }) =>
						value.trim() ? undefined : t("sites.form.nameRequired"),
				}}
			>
				{(field) => (
					<TextField
						id="site-name"
						label={t("sites.form.name")}
						placeholder={t("sites.form.namePlaceholder")}
						required
						maxLength={MAX_SITE_LENGTH.name}
						value={field.state.value}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
						error={field.state.meta.errors[0]}
					/>
				)}
			</form.Field>
			<form.Field name="address">
				{(field) => (
					<TextField
						id="site-address"
						label={t("sites.form.address")}
						placeholder={t("sites.form.addressPlaceholder")}
						maxLength={MAX_SITE_LENGTH.address}
						autoComplete="street-address"
						value={field.state.value}
						onChange={field.handleChange}
					/>
				)}
			</form.Field>
			<form.Field name="location">
				{(field) => (
					<LocationField
						id="site-location"
						label={t("sites.form.location")}
						value={field.state.value}
						onChange={field.handleChange}
					/>
				)}
			</form.Field>
			<div className="grid gap-5 sm:grid-cols-2">
				<form.Field name="contactName">
					{(field) => (
						<TextField
							id="site-contact"
							label={t("sites.form.contactName")}
							placeholder={t("sites.form.contactNamePlaceholder")}
							maxLength={MAX_SITE_LENGTH.contactName}
							value={field.state.value}
							onChange={field.handleChange}
						/>
					)}
				</form.Field>
				<form.Field
					name="contactPhone"
					validators={{
						onBlur: ({ value }) =>
							!value.trim() || isValidSitePatch({ contactPhone: value.trim() })
								? undefined
								: t("sites.form.phoneInvalid"),
					}}
				>
					{(field) => (
						<TextField
							id="site-phone"
							type="tel"
							label={t("sites.form.contactPhone")}
							placeholder={t("sites.form.contactPhonePlaceholder")}
							maxLength={MAX_SITE_LENGTH.contactPhone}
							value={field.state.value}
							onChange={field.handleChange}
							onBlur={field.handleBlur}
							error={field.state.meta.errors[0]}
						/>
					)}
				</form.Field>
			</div>
			<form.Field name="accessNotes">
				{(field) => (
					<TextAreaField
						id="site-notes"
						label={t("sites.form.accessNotes")}
						placeholder={t("sites.form.accessNotesPlaceholder")}
						hint={t("sites.form.accessNotesHint")}
						maxLength={MAX_SITE_LENGTH.accessNotes}
						rows={4}
						value={field.state.value}
						onChange={field.handleChange}
					/>
				)}
			</form.Field>
		</FormSheet>
	);
}
