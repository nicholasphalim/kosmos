// npm run demo:reset
// 1. Menulis token baru ke .demo-reset. Browser yang membuka dev server akan menghapus
//    data demo di localStorage (sesi, outbox, dan database mock) saat halaman berikutnya dimuat.
// 2. Bila backend sedang jalan (mode live), database backend juga dikembalikan lewat POST /dev/reset.
import { writeFileSync } from "node:fs";

writeFileSync(".demo-reset", String(Date.now()));

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
try {
  const res = await fetch(`${base}/dev/reset`, { method: "POST", signal: AbortSignal.timeout(15000) });
  console.log(res.ok ? "Database backend di-reset." : `Backend menolak reset (HTTP ${res.status}).`);
} catch {
  /* backend tidak jalan: cukup reset mode mock */
}
console.log("Data demo akan di-reset. Refresh halaman Kosmos di browser.");
