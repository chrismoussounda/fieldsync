import {
	type ColumnDef,
	createColumnHelper,
	createSortedRowModel,
	FlexRender,
	metaHelper,
	type RowData,
	rowSortingFeature,
	type SortingState,
	sortFn_alphanumeric,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { SortDescriptor } from "react-aria-components";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		text: sortFn_text,
		datetime: sortFn_datetime,
	},
	/** Classes for a column's header and cells, e.g. widths or alignment. */
	columnMeta: metaHelper<{ className?: string }>(),
});

type Features = typeof features;

export const columnHelper = <T extends RowData>() =>
	createColumnHelper<Features, T>();

type Props<T extends RowData> = {
	label: string;
	data: T[];
	// biome-ignore lint/suspicious/noExplicitAny: each column has its own value type.
	columns: ColumnDef<Features, T, any>[];
	getRowId: (row: T) => string;
	empty: ReactNode;
	/** Dims a row, e.g. a disabled account. */
	muted?: (row: T) => boolean;
};

/** A shadcn table, sorted by TanStack Table. */
export function DataTable<T extends RowData>({
	label,
	data,
	columns,
	getRowId,
	empty,
	muted,
}: Props<T>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const table = useTable({
		features,
		columns,
		data,
		getRowId,
		state: { sorting },
		onSortingChange: setSorting,
	});
	const headers = table.getHeaderGroups()[0]?.headers ?? [];
	const sort = sorting[0];
	const descriptor: SortDescriptor | undefined = sort && {
		column: sort.id,
		direction: sort.desc ? "descending" : "ascending",
	};

	return (
		<div className="overflow-hidden rounded-2xl border bg-card">
			<Table
				aria-label={label}
				sortDescriptor={descriptor}
				onSortChange={(next) =>
					setSorting([
						{
							id: String(next.column),
							desc: next.direction === "descending",
						},
					])
				}
			>
				<TableHeader className="bg-muted/40">
					{headers.map((header, i) => (
						<TableHead
							key={header.id}
							id={header.id}
							isRowHeader={i === 0}
							allowsSorting={header.column.getCanSort()}
							className={cn(
								"h-12 px-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
								header.column.getCanSort() && "cursor-pointer select-none",
								header.column.columnDef.meta?.className,
							)}
						>
							{({ sortDirection }) => (
								<span className="inline-flex items-center gap-1">
									<FlexRender header={header} />
									{sortDirection === "ascending" && (
										<ArrowUp aria-hidden className="size-3.5" />
									)}
									{sortDirection === "descending" && (
										<ArrowDown aria-hidden className="size-3.5" />
									)}
								</span>
							)}
						</TableHead>
					))}
				</TableHeader>
				<TableBody
					renderEmptyState={() => (
						<div className="py-10 text-center text-sm text-muted-foreground">
							{empty}
						</div>
					)}
				>
					{table.getRowModel().rows.map((row) => (
						<TableRow
							key={row.id}
							id={row.id}
							className={cn(
								"relative",
								muted?.(row.original) && "text-muted-foreground",
							)}
						>
							{row.getAllCells().map((cell) => (
								<TableCell
									key={cell.id}
									className={cn(
										"px-5 py-4",
										cell.column.columnDef.meta?.className,
									)}
								>
									<FlexRender cell={cell} />
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
