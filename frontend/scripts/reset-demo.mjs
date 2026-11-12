// npm run demo:reset
// Menulis token baru ke .demo-reset. Browser yang membuka dev server akan menghapus
// data demo (localStorage) saat halaman berikutnya dimuat.
import { writeFileSync } from "node:fs";

writeFileSync(".demo-reset", String(Date.now()));
console.log("Data demo akan di-reset. Refresh halaman Kosmos di browser.");
