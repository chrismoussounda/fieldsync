import { cn } from "cn";
import { CheckIcon, MinusIcon } from "lucide-react";
import {
	Checkbox as CheckboxPrimitive,
	type CheckboxProps,
	composeRenderProps,
} from "react-aria-components";

// The box gets its own element so a label beside it stays clickable.
function Checkbox({ className, children, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive
			data-slot="checkbox"
			className={composeRenderProps(className, (className) =>
				cn(
					"group/checkbox flex items-center gap-2 outline-none data-disabled:cursor-not-allowed",
					className,
				),
			)}
			{...props}
		>
			{composeRenderProps(
				children,
				(children, { isSelected, isIndeterminate }) => (
					<>
						<span
							data-slot="checkbox-indicator"
							className="grid size-5 shrink-0 place-content-center rounded-md border border-input bg-card transition-colors group-data-disabled/checkbox:opacity-50 group-data-focus-visible/checkbox:border-ring group-data-focus-visible/checkbox:ring-3 group-data-focus-visible/checkbox:ring-ring/50 group-data-invalid/checkbox:border-destructive group-data-selected/checkbox:border-primary group-data-selected/checkbox:bg-primary group-data-selected/checkbox:text-primary-foreground group-data-indeterminate/checkbox:border-primary group-data-indeterminate/checkbox:bg-primary group-data-indeterminate/checkbox:text-primary-foreground dark:bg-input/30 [&>svg]:size-3.5"
						>
							{isIndeterminate ? <MinusIcon /> : isSelected && <CheckIcon />}
						</span>
						{children}
					</>
				),
			)}
		</CheckboxPrimitive>
	);
}

export { Checkbox };
