import { loadRepoEnv } from "../shared/loadEnv.js";
import { dailyFlow } from "./flows/daily.js";

loadRepoEnv();

export async function run(): Promise<void> {
  await dailyFlow();
}
