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

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	submitLabel: string;
	busy?: boolean;
	onSubmit: () => void;
	children: ReactNode;
};

/** A form beside the page on desktop, rising from the bottom on phones. */
export function FormSheet(props: Props) {
	const phone = usePhone();
	const { open, onOpenChange, title, description } = props;
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
					<Body {...props} />
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
			<div className="grid gap-1.5 border-b px-7 py-6">
				<SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
				{description && <SheetDescription>{description}</SheetDescription>}
			</div>
			<Body {...props} />
		</Sheet>
	);
}

function Body({ onSubmit, onOpenChange, submitLabel, busy, children }: Props) {
	const { t } = useTranslation();
	function submit(event: FormEvent) {
		event.preventDefault();
		onSubmit();
	}
	return (
		<form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
			<div className="grid flex-1 content-start gap-6 overflow-y-auto px-5 py-6 md:px-7">
				{children}
			</div>
			<div className="flex gap-2 border-t bg-popover px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:justify-end md:px-7">
				<Button
					variant="outline"
					className="h-11 flex-1 px-5 md:h-10 md:flex-none"
					onPress={() => onOpenChange(false)}
				>
					{t("common.cancel")}
				</Button>
				<Button
					type="submit"
					isDisabled={busy}
					className="h-11 flex-1 px-5 md:h-10 md:flex-none"
				>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}
