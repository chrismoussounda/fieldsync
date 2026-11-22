import { cn } from "cn";
import { Label } from "@/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { usePhone } from "@/lib/use-phone";

export type Option = { value: string; label: string };

type Props = {
	id: string;
	/** Visible label; filters without one pass `ariaLabel`. */
	label?: string;
	ariaLabel?: string;
	placeholder: string;
	options: readonly Option[];
	value: string | null;
	onChange: (value: string) => void;
	hint?: string;
	error?: string | null;
	required?: boolean;
	isDisabled?: boolean;
	className?: string;
};

/** A custom list on desktop; the phone's own picker on phones. */
export function SelectField(props: Props) {
	const phone = usePhone();
	const { id, label, ariaLabel, hint, error, required, className } = props;
	const note = error ? (
		<p id={`${id}-error`} className="text-sm text-destructive">
			{error}
		</p>
	) : (
		hint && (
			<p id={`${id}-hint`} className="text-sm text-muted-foreground">
				{hint}
			</p>
		)
	);
	const mark = required && (
		<span aria-hidden className="text-destructive">
			*
		</span>
	);

	if (phone) {
		return (
			<div className={cn("grid gap-1.5", className)}>
				{label && (
					<Label htmlFor={id}>
						{label}
						{mark}
					</Label>
				)}
				<NativeSelect
					id={id}
					aria-label={label ? undefined : ariaLabel}
					value={props.value ?? ""}
					disabled={props.isDisabled}
					required={required}
					aria-invalid={error ? true : undefined}
					onChange={(e) => props.onChange(e.target.value)}
					className="w-full [&_select]:h-11 [&_select]:bg-card [&_select]:text-base"
				>
					<NativeSelectOption value="" disabled>
						{props.placeholder}
					</NativeSelectOption>
					{props.options.map((o) => (
						<NativeSelectOption key={o.value} value={o.value}>
							{o.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
				{note}
			</div>
		);
	}

	return (
		<Select
			id={id}
			aria-label={label ? undefined : ariaLabel}
			placeholder={props.placeholder}
			selectedKey={props.value}
			onSelectionChange={(key) => key !== null && props.onChange(String(key))}
			isDisabled={props.isDisabled}
			isRequired={required}
			isInvalid={Boolean(error)}
			className={cn("grid w-full gap-1.5", className)}
		>
			{label && (
				<Label>
					{label}
					{mark}
				</Label>
			)}
			<SelectTrigger className="h-10 w-full bg-card">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{props.options.map((o) => (
					<SelectItem key={o.value} id={o.value} className="py-2">
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
			{note}
		</Select>
	);
}
