import { RefreshCw } from "lucide-react";

export function Logo() {
	return (
		<span className="flex items-center gap-2 text-lg font-bold tracking-tight">
			<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
				<RefreshCw className="size-4" aria-hidden />
			</span>
			FieldSync
		</span>
	);
}
