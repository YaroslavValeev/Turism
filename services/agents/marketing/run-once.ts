import { run } from "./runner.js";

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
