import { downloadUser, fileResponse } from "@/server/downloads";
import { toCsv, userEntries } from "@/server/statements";

const TYPES = ["DEPOSIT", "WITHDRAWAL", "TRADE", "TRANSFER", "FEE", "REWARD", "ADJUSTMENT"];
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** GET /history/export?type=&q=&from=&to=: the filtered transaction history as CSV (max 5,000 rows). */
export async function GET(request: Request) {
  const auth = await downloadUser();
  if ("error" in auth) return auth.error;
  const sp = new URL(request.url).searchParams;
  const type = TYPES.find((t) => t === sp.get("type"));
  const from = sp.get("from");
  const to = sp.get("to");
  const rows = await userEntries(
    auth.user.id,
    {
      type,
      q: sp.get("q")?.trim().slice(0, 80) || undefined,
      from: isDate(from) ? new Date(`${from}T00:00:00Z`) : undefined,
      to: isDate(to) ? new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000) : undefined,
    },
    5000,
  );
  const csv = toCsv(
    ["date_utc", "type", "description", "accounts", "changes", "reference"],
    rows.map((e) => [
      e.createdAt.toISOString(),
      e.type,
      e.description,
      e.accounts.join("; "),
      e.changes.map((c) => `${c.amount} ${c.asset}`).join("; "),
      e.id,
    ]),
  );
  return fileResponse(csv, "orbtrade-history.csv", "text/csv; charset=utf-8");
}
