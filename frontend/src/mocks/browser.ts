import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { resetDb } from "./db";

const worker = setupWorker(...handlers);

export async function startMockApi() {
  await worker.start({
    onUnhandledFrame: "bypass",
    quiet: true,
  });
  // Utilitas demo: jalankan kosmosResetDemo() di console browser untuk mengembalikan data awal.
  (window as unknown as { kosmosResetDemo: () => void }).kosmosResetDemo = () => {
    resetDb();
    location.reload();
  };
}
