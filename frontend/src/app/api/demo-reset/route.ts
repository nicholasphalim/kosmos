import { readFile } from "node:fs/promises";
import { connection } from "next/server";

/**
 * Token reset data demo, ditulis oleh `npm run demo:reset` ke file .demo-reset.
 * Bila file belum ada, token bernilai null (tidak ada reset).
 */
export async function GET() {
  await connection();
  const token = await readFile(".demo-reset", "utf8")
    .then((s) => s.trim() || null)
    .catch(() => null);
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
