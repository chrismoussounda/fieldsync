import type { Authorize } from "./push.ts";
import { UNSCOPED } from "./scope.ts";

/** For tests of the sync engine itself, where roles do not matter. */
export const allowAll: Authorize = () => true;

/** Push options for those tests: anyone may write, and no record is scoped. */
export const openRules = { authorize: allowAll, scoping: UNSCOPED };
