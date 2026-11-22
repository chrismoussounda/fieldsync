import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usePhone } from "@/lib/use-phone";

type Frame = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: ReactNode;
};

/** A panel beside the page on desktop, rising from the bottom on phones. */
export function SideSheet({
	open,
	onOpenChange,
	title,
	description,
	children,
}: Frame) {
	const phone = usePhone();
	if (phone) {
		return (
			<Drawer open={open} onOpenChange={(next) => onOpenChange(next)}>
				<DrawerContent>
					<div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
					<div className="grid gap-1 px-5 pt-3">
						<DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
						{description && (
							<DrawerDescription>{description}</DrawerDescription>
						)}
					</div>
					{children}
				</DrawerContent>
			</Drawer>
		);
	}
	return (
		<Sheet
			isOpen={open}
			onOpenChange={onOpenChange}
			isDismissable
			className="w-full gap-0 data-[side=right]:sm:max-w-lg"
		>
			<div className="grid gap-1.5 border-b px-7 py-6 pr-14">
				<SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
				{description && <SheetDescription>{description}</SheetDescription>}
			</div>
			{children}
		</Sheet>
	);
}

const BODY =
	"grid flex-1 content-start gap-6 overflow-y-auto px-5 py-6 md:px-7";
const FOOTER =
	"flex gap-2 border-t bg-popover px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:justify-end md:px-7";
const ACTION = "h-11 flex-1 px-5 md:h-10 md:flex-none";

/** Details to read, with optional actions at the bottom. */
export function DetailSheet({
	actions,
	...frame
}: Frame & { actions?: ReactNode }) {
	return (
		<SideSheet {...frame}>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className={BODY}>{frame.children}</div>
				{actions && <div className={FOOTER}>{actions}</div>}
			</div>
		</SideSheet>
	);
}

/** A form in a side sheet, Cancel and Save kept at the bottom. */
export function FormSheet({
	submitLabel,
	busy,
	onSubmit,
	...frame
}: Frame & { submitLabel: string; busy?: boolean; onSubmit: () => void }) {
	const { t } = useTranslation();
	function submit(event: FormEvent) {
		event.preventDefault();
		onSubmit();
	}
	return (
		<SideSheet {...frame}>
			<form
				onSubmit={submit}
				noValidate
				className="flex min-h-0 flex-1 flex-col"
			>
				<div className={BODY}>{frame.children}</div>
				<div className={FOOTER}>
					<Button
						variant="outline"
						className={ACTION}
						onPress={() => frame.onOpenChange(false)}
					>
						{t("common.cancel")}
					</Button>
					<Button type="submit" isDisabled={busy} className={ACTION}>
						{submitLabel}
					</Button>
				</div>
			</form>
		</SideSheet>
	);
}

export const sheetAction = ACTION;
