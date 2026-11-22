import { cn } from "cn";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldProps = {
	id: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	hint?: string;
	error?: string | null;
	required?: boolean;
	maxLength?: number;
	autoComplete?: string;
	inputMode?: "decimal" | "numeric" | "text";
	className?: string;
};

export function Field({
	id,
	label,
	hint,
	error,
	required,
	className,
	children,
}: Pick<
	FieldProps,
	"id" | "label" | "hint" | "error" | "required" | "className"
> & {
	children: ReactNode;
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={id}>
				{label}
				{required && (
					<span aria-hidden className="text-destructive">
						*
					</span>
				)}
			</Label>
			{children}
			{error ? (
				<p id={`${id}-error`} className="text-sm text-destructive">
					{error}
				</p>
			) : (
				hint && (
					<p id={`${id}-hint`} className="text-sm text-muted-foreground">
						{hint}
					</p>
				)
			)}
		</div>
	);
}

const describedBy = ({ id, error, hint }: FieldProps) =>
	error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
	type = "text",
	...props
}: FieldProps & { type?: "text" | "tel" | "email" | "search" | "password" }) {
	return (
		<Field {...props}>
			<Input
				id={props.id}
				type={type}
				value={props.value}
				placeholder={props.placeholder}
				required={props.required}
				maxLength={props.maxLength}
				autoComplete={props.autoComplete}
				inputMode={props.inputMode}
				aria-invalid={props.error ? true : undefined}
				aria-describedby={describedBy(props)}
				onChange={(e) => props.onChange(e.target.value)}
				onBlur={props.onBlur}
				className="h-10"
			/>
		</Field>
	);
}

export function TextAreaField(props: FieldProps & { rows?: number }) {
	return (
		<Field {...props}>
			<Textarea
				id={props.id}
				value={props.value}
				placeholder={props.placeholder}
				required={props.required}
				maxLength={props.maxLength}
				rows={props.rows ?? 3}
				aria-invalid={props.error ? true : undefined}
				aria-describedby={describedBy(props)}
				onChange={(e) => props.onChange(e.target.value)}
				onBlur={props.onBlur}
			/>
		</Field>
	);
}
