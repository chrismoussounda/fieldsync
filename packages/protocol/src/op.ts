import { z } from "zod";

const hlc = z.string().regex(/^[0-9a-f]{13}-[0-9a-f]{4}-[0-9a-f]{8}$/);

export const OpSchema = z
	.object({
		opId: z.uuid(),
		deviceId: z.uuid(),
		entityType: z.string().min(1),
		entityId: z.uuid(),
		kind: z.enum(["upsert", "delete", "restore"]),
		patch: z.record(z.string(), z.json()),
		// Per field, the clock of the value the user was looking at when editing.
		base: z.record(z.string(), hlc),
		hlc,
		clientVersion: z.string().min(1),
	})
	.refine((op) => op.hlc.endsWith(op.deviceId.slice(0, 8).toLowerCase()), {
		message: "hlc node must match the device id",
		path: ["hlc"],
	});

export type Op = z.infer<typeof OpSchema>;
