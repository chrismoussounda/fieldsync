import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

/** Opens a phone's filters; shows how many differ from the defaults. */
export function FiltersButton({
	count,
	onPress,
}: {
	count: number;
	onPress: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Button variant="outline" className="h-10 bg-card px-3" onPress={onPress}>
			<SlidersHorizontal aria-hidden />
			{t("orders.filters")}
			{count > 0 && (
				<span className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
					{count}
				</span>
			)}
		</Button>
	);
}

/** A phone's filters in a drawer, so the page keeps its room. */
export function FilterDrawer({
	open,
	onOpenChange,
	onClear,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onClear: () => void;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
				<div className="grid gap-5 overflow-y-auto px-5 pt-3 pb-4">
					<DrawerTitle className="text-lg font-semibold">
						{t("orders.filters")}
					</DrawerTitle>
					{children}
				</div>
				<div className="flex gap-2 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<Button variant="outline" className="h-11 flex-1" onPress={onClear}>
						{t("orders.clear")}
					</Button>
					<Button className="h-11 flex-1" onPress={() => onOpenChange(false)}>
						{t("orders.apply")}
					</Button>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
