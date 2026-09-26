import { downloadUser, fileResponse } from "@/server/downloads";
import { isMonth, statementPdf } from "@/server/statements";

/** GET /history/statement/YYYY-MM: the signed-in user's own monthly statement (PDF). */
export async function GET(_req: Request, ctx: RouteContext<"/history/statement/[month]">) {
  const auth = await downloadUser();
  if ("error" in auth) return auth.error;
  const { month } = await ctx.params;
  if (!isMonth(month)) return new Response("Not found", { status: 404 });
  const pdf = await statementPdf(auth.user, month);
  return fileResponse(pdf, `orbtrade-statement-${month}.pdf`, "application/pdf");
}
