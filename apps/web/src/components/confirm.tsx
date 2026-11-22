import { useTranslation } from "react-i18next";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => void;
};

/** Asks before a destructive action. */
export function Confirm({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	onConfirm,
}: Props) {
	const { t } = useTranslation();
	return (
		<AlertDialog isOpen={open} onOpenChange={onOpenChange}>
			<AlertDialogHeader>
				<AlertDialogTitle>{title}</AlertDialogTitle>
				<AlertDialogDescription>{description}</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
				<AlertDialogAction variant="destructive" onPress={onConfirm}>
					{confirmLabel}
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialog>
	);
}
