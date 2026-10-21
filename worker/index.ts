import { tick } from "../lib/engine";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 30_000);
let running = false;
let stopping = false;

async function loop() {
  if (running || stopping) return;
  running = true;
  try {
    const r = await tick();
    if (r.killed) console.log(new Date().toISOString(), "kill switch is ON, Joe is paused");
  } catch (e) {
    console.error("tick failed", e);
  } finally {
    running = false;
  }
}

console.log(`Joe worker started (interval ${INTERVAL_MS / 1000}s, DRY_RUN=${process.env.DRY_RUN ?? "1"})`);
void loop();
const timer = setInterval(loop, INTERVAL_MS);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    clearInterval(timer);
    console.log("Joe worker stopping");
    setTimeout(() => process.exit(0), 500);
  });
}
