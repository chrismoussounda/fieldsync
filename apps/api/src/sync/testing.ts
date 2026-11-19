import type { Authorize } from "./push.ts";

/** For tests of the sync engine itself, where roles do not matter. */
export const allowAll: Authorize = () => true;
