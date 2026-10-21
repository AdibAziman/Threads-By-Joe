// Runs the web app and Joe's worker side by side, and stops both if either dies,
// so the platform restarts the container instead of leaving half the product running.
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
// Spawn node directly (not npx) so SIGTERM reaches the real processes instead of a wrapper.
const procs = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "worker/index.ts"], { stdio: "inherit" }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 3000).unref();
}

for (const p of procs) p.on("exit", (code) => stop(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0));
