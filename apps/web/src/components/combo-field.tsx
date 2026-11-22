import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import {
	Button as AriaButton,
	ComboBox,
	Input,
	ListBox,
	ListBoxItem,
	Popover,
} from "react-aria-components";
import { Label } from "@/components/ui/label";

type Props = {
	id: string;
	label: string;
	placeholder: string;
	/** Offered as you type; any other text is kept as typed. */
	suggestions: readonly string[];
	value: string;
	onChange: (value: string) => void;
	maxLength?: number;
	required?: boolean;
	error?: string | null;
	className?: string;
};

/** Free text with suggestions, searchable on every screen size. */
export function ComboField({
	id,
	label,
	placeholder,
	suggestions,
	value,
	onChange,
	maxLength,
	required,
	error,
	className,
}: Props) {
	const items = suggestions.map((s) => ({ id: s, name: s }));
	return (
		<ComboBox
			id={id}
			allowsCustomValue
			allowsEmptyCollection
			menuTrigger="focus"
			inputValue={value}
			onInputChange={onChange}
			defaultItems={items}
			isRequired={required}
			isInvalid={Boolean(error)}
			className={cn("grid gap-2", className)}
		>
			<Label>
				{label}
				{required && (
					<span aria-hidden className="text-destructive">
						*
					</span>
				)}
			</Label>
			<div className="relative">
				<Input
					placeholder={placeholder}
					maxLength={maxLength}
					className="h-10 w-full rounded-lg border border-input bg-card pr-10 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-invalid:border-destructive dark:bg-input/30"
				/>
				<AriaButton
					data-slot="combo-open"
					className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted"
				>
					<ChevronDown aria-hidden className="size-4" />
				</AriaButton>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Popover
				offset={6}
				className="z-50 w-(--trigger-width) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-entering:animate-in data-entering:fade-in-0"
			>
				<ListBox className="max-h-64 overflow-y-auto p-1 outline-none empty:hidden">
					{(item: { id: string; name: string }) => (
						<ListBoxItem
							id={item.id}
							textValue={item.name}
							className="cursor-pointer rounded-md px-2.5 py-2 text-base outline-none data-focused:bg-accent data-focused:text-accent-foreground"
						>
							{item.name}
						</ListBoxItem>
					)}
				</ListBox>
			</Popover>
		</ComboBox>
	);
}
