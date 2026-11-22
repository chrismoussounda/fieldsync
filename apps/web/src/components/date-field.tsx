import { parseDate } from "@internationalized/date";
import { cn } from "cn";
import { CalendarDays, X } from "lucide-react";
import {
	Button as AriaButton,
	DateInput,
	DatePicker,
	DateSegment,
	Dialog,
	Group,
	Popover,
} from "react-aria-components";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePhone } from "@/lib/use-phone";

type Props = {
	id: string;
	label: string;
	/** `yyyy-mm-dd`, or "" for none. */
	value: string;
	onChange: (value: string) => void;
	hint?: string;
	isDisabled?: boolean;
	clearLabel: string;
};

const parse = (value: string) => {
	try {
		return value ? parseDate(value) : null;
	} catch {
		return null;
	}
};

/** A calendar popover on desktop; the phone's own date picker on phones. */
export function DateField({
	id,
	label,
	value,
	onChange,
	hint,
	isDisabled,
	clearLabel,
}: Props) {
	const phone = usePhone();
	const note = hint && (
		<p id={`${id}-hint`} className="text-sm text-muted-foreground">
			{hint}
		</p>
	);

	if (phone) {
		return (
			<div className="grid gap-2">
				<Label htmlFor={id}>{label}</Label>
				<Input
					id={id}
					type="date"
					value={value}
					disabled={isDisabled}
					onChange={(e) => onChange(e.target.value)}
					className="h-11 bg-card"
				/>
				{note}
			</div>
		);
	}

	return (
		<DatePicker
			id={id}
			value={parse(value)}
			onChange={(next) => onChange(next ? next.toString() : "")}
			isDisabled={isDisabled}
			className="group grid gap-2"
		>
			<Label>{label}</Label>
			<Group
				className={cn(
					"flex h-10 items-center rounded-lg border border-input bg-card pr-1 pl-3 transition-colors",
					"focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-disabled:opacity-50 dark:bg-input/30",
				)}
			>
				<DateInput className="flex flex-1 text-base">
					{(segment) => (
						<DateSegment
							segment={segment}
							className="rounded px-0.5 tabular-nums outline-none data-focused:bg-primary data-focused:text-primary-foreground data-placeholder:text-muted-foreground data-[type=literal]:px-0"
						/>
					)}
				</DateInput>
				{value && !isDisabled && (
					<AriaButton
						data-slot="date-clear"
						slot={null}
						aria-label={clearLabel}
						onPress={() => onChange("")}
						className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted"
					>
						<X aria-hidden className="size-4" />
					</AriaButton>
				)}
				<AriaButton
					data-slot="date-open"
					className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted data-focus-visible:ring-3 data-focus-visible:ring-ring/50"
				>
					<CalendarDays aria-hidden className="size-[1.125rem]" />
				</AriaButton>
			</Group>
			{note}
			<Popover
				placement="bottom end"
				offset={6}
				className="z-50 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0"
			>
				<Dialog className="outline-none">
					<Calendar className="bg-transparent [--cell-size:--spacing(9)]" />
				</Dialog>
			</Popover>
		</DatePicker>
	);
}
