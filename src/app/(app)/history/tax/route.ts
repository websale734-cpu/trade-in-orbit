import { downloadUser, fileResponse } from "@/server/downloads";
import { taxCsv, taxPdf, taxRows } from "@/server/statements";

/** GET /history/tax?year=2026&format=csv|pdf: the signed-in user's tax transaction report. */
export async function GET(request: Request) {
  const auth = await downloadUser();
  if ("error" in auth) return auth.error;
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get("year"));
  if (!Number.isInteger(year) || year < 2009 || year > new Date().getUTCFullYear()) return new Response("Invalid year", { status: 400 });
  const rows = await taxRows(auth.user.id, year);
  if (sp.get("format") === "pdf") return fileResponse(await taxPdf(auth.user, year, rows), `orbtrade-tax-${year}.pdf`, "application/pdf");
  return fileResponse(taxCsv(rows), `orbtrade-tax-${year}.csv`, "text/csv; charset=utf-8");
}
