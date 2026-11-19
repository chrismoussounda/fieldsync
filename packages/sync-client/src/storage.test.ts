import { describeStorage } from "./contract.ts";
import { MemoryStorage } from "./storage.ts";

describeStorage("memory", async () => new MemoryStorage());
