import type { ReactNode } from "react";

/** The page's title, with its note beside it when there is room, and its actions. */
export function PageHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
					{title}
				</h1>
				{description && <p className="text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
		</div>
	);
}
