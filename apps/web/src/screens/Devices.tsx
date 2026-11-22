import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { columnHelper, DataTable } from "@/components/data-table";
import { Offline } from "@/components/offline";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/person";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { ITEM_IN } from "@/lib/use-leaving";
import { usePhone } from "@/lib/use-phone";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { messageFor } from "../app/errors.ts";
import { ago } from "../app/time.ts";
import { apiFetch } from "../app/workspace.ts";
import type { Session } from "../auth/session.ts";

type Device = {
	id: string;
	name: string;
	user: { id: string; name: string };
	registeredAt: string;
	lastSeenAt: string | null;
	revokedAt: string | null;
};

/** Every device signed in to the org, so an admin can lock out a lost one. */
export function Devices({ session }: { session: Session }) {
	const { t, i18n } = useTranslation();
	const phone = usePhone();
	const client = useQueryClient();
	const confirm = useSheet<Device>();
	const revoking = confirm.value;
	const devices = useQuery({
		queryKey: ["devices"],
		queryFn: async () =>
			(await apiFetch<{ devices: Device[] }>(session, "/devices"))?.devices ??
			[],
	});
	const mine = useQuery({
		queryKey: ["device-id"],
		queryFn: () => session.deviceId(),
	});

	async function revoke(device: Device) {
		try {
			await apiFetch(session, `/devices/${device.id}/revoke`, {
				method: "POST",
			});
			toast.success(t("devices.revokedToast"));
			await client.invalidateQueries({ queryKey: ["devices"] });
		} catch (e) {
			toast.error(messageFor(e));
		}
	}

	// Active devices first, most recently seen on top.
	const sorted = [...(devices.data ?? [])].sort(
		(a, b) =>
			Number(a.revokedAt !== null) - Number(b.revokedAt !== null) ||
			(b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
	);
	const seen = (d: Device) =>
		d.lastSeenAt
			? ago(d.lastSeenAt, Date.now(), i18n.language)
			: t("devices.never");
	const added = (d: Device) => formatDay(d.registeredAt.slice(0, 10));
	const state = (d: Device) =>
		d.revokedAt ? (
			<span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
				{t("devices.revoked")}
			</span>
		) : d.id === mine.data ? (
			<span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
				{t("devices.thisDevice")}
			</span>
		) : (
			<Button
				variant="outline"
				size="sm"
				onPress={() => confirm.show(d)}
				aria-label={`${t("devices.revoke")} ${d.name}, ${d.user.name}`}
			>
				{t("devices.revoke")}
			</Button>
		);
	const helper = columnHelper<Device>();
	const columns = helper.columns([
		helper.accessor("name", {
			header: t("devices.device"),
			cell: ({ row }) => (
				<span className="flex items-center gap-2.5 font-medium">
					<Smartphone aria-hidden className="size-4 text-muted-foreground" />
					{row.original.name}
				</span>
			),
		}),
		helper.accessor((d) => d.user.name, {
			id: "user",
			header: t("devices.user"),
			cell: ({ row }) => <Person name={row.original.user.name} />,
		}),
		helper.accessor((d) => d.lastSeenAt ?? "", {
			id: "lastSeen",
			header: t("devices.lastSeen"),
			cell: ({ row }) => seen(row.original),
		}),
		helper.accessor("registeredAt", {
			header: t("devices.added"),
			cell: ({ row }) => added(row.original),
		}),
		helper.display({
			id: "state",
			header: () => <span className="sr-only">{t("common.actions")}</span>,
			cell: ({ row }) => state(row.original),
			meta: { className: "text-right" },
		}),
	]);

	return (
		<div className="grid grid-cols-1 gap-8">
			<PageHeader
				title={t("devices.title")}
				description={t("devices.description")}
			/>
			{devices.isError ? (
				<Offline
					text={t("devices.offline")}
					onRetry={() => void devices.refetch()}
				/>
			) : phone ? (
				<ul className="grid gap-2">
					{sorted.map((d) => (
						<li
							key={d.id}
							className={cn(
								"grid gap-3 rounded-2xl border bg-card p-6",
								ITEM_IN,
								d.revokedAt && "text-muted-foreground",
							)}
						>
							<div className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-2.5 font-medium">
									<Smartphone aria-hidden className="size-4" />
									{d.name}
								</span>
								{state(d)}
							</div>
							<div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
								<Person name={d.user.name} />
								<span>{seen(d)}</span>
							</div>
						</li>
					))}
				</ul>
			) : (
				<DataTable
					label={t("devices.title")}
					data={sorted}
					columns={columns}
					getRowId={(d) => d.id}
					muted={(d) => d.revokedAt !== null}
					empty={t("devices.empty")}
				/>
			)}
			<Confirm
				open={confirm.open}
				onOpenChange={(next) => !next && confirm.hide()}
				title={t("devices.revokeTitle")}
				description={t("devices.revokeBody", {
					name: revoking?.user.name ?? "",
					device: revoking?.name ?? "",
				})}
				confirmLabel={t("devices.revoke")}
				onConfirm={() => revoking && void revoke(revoking)}
			/>
		</div>
	);
}
