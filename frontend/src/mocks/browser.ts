import { setupWorker } from "msw/browser";
import { resetDemo } from "@/lib/demoReset";
import { handlers } from "./handlers";

const worker = setupWorker(...handlers);

export async function startMockApi() {
  await worker.start({
    onUnhandledFrame: "bypass",
    quiet: true,
  });
  // Cadangan: kosmosResetDemo() di console browser juga mengembalikan data awal.
  (window as unknown as { kosmosResetDemo: () => void }).kosmosResetDemo = resetDemo;
}
