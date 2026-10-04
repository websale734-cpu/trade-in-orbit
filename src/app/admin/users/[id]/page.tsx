import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { ADMIN_LABELS } from "@/server/ledger";
import { cn } from "@/lib/utils";
import { adjustUserBalance, correctUserAdjustment, decideKyc, setUserRole, setUserStatus } from "../../actions";

export const metadata = { title: "User" };

const PAGE_SIZE = 25;

const qty = (n: number, decimals = 8) =>
  n.toLocaleString("en-US", { maximumFractionDigits: Math.min(8, Math.max(0, decimals)) });
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const words = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("glass min-w-0 scroll-mt-6 rounded-2xl p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fields({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AdminUser({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { user: admin } = await requirePermission("users.view");
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(typeof sp.page === "string" ? sp.page : "") || 1));

  const u = await db.user.findUnique({
    where: { id },
    include: {
      accounts: {
        include: { ledgerAccounts: { where: { balance: { not: 0 } }, include: { asset: true } } },
        orderBy: { createdAt: "asc" },
      },
      kycSubmissions: {
        orderBy: { submittedAt: "desc" },
        include: { reviewer: { select: { name: true } }, files: { select: { kind: true } } },
      },
      securityEvents: { orderBy: { createdAt: "desc" }, take: 10 },
      referredBy: { select: { id: true, name: true } },
      _count: { select: { referrals: true, orders: true, supportTickets: true } },
    },
  });
  if (!u) notFound();

  const showInternal = can(admin, "audit.view");
  const canAdjust = can(admin, "ledger.adjust");

  const [assets, snapshot, entries, entryCount, adjustmentIds, transfers] = await Promise.all([
    db.asset.findMany({
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, decimals: true, type: true },
    }),
    getMarketSnapshot().catch(() => null),
    db.journalEntry.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        postings: {
          include: { ledgerAccount: { select: { account: { select: { userId: true, name: true, type: true } } } } },
        },
      },
    }),
    db.journalEntry.count({ where: { userId: u.id } }),
    db.journalEntry.findMany({ where: { userId: u.id, type: "ADJUSTMENT" }, select: { id: true } }),
    Promise.all([
      db.deposit.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
      db.withdrawal.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]),
  ]);
  const decimalsOf = new Map(assets.map((a) => [a.code, a.decimals]));
  const nameOf = new Map(assets.map((a) => [a.code, a.name]));

  // ---- Balances: per coin across real accounts, valued in USD where a price is known.
  const prices = new Map<string, number>([["USD", 1]]);
  for (const t of snapshot?.tickers ?? []) if (!prices.has(t.symbol)) prices.set(t.symbol, t.priceUsd);
  const realAccounts = u.accounts.filter((a) => a.type !== "DEMO");
  const demoAccounts = u.accounts.filter((a) => a.type === "DEMO");
  const coins = new Map<string, { total: number; byAccount: { name: string; balance: number }[] }>();
  for (const a of realAccounts)
    for (const l of a.ledgerAccounts) {
      const c = coins.get(l.assetCode) ?? { total: 0, byAccount: [] };
      c.total += Number(l.balance);
      c.byAccount.push({ name: a.archivedAt ? `${a.name} (archived)` : a.name, balance: Number(l.balance) });
      coins.set(l.assetCode, c);
    }
  const coinRows = [...coins.entries()]
    .map(([code, c]) => ({ code, ...c, value: prices.has(code) ? c.total * prices.get(code)! : null }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const totalUsd = coinRows.reduce((s, c) => s + (c.value ?? 0), 0);
  const unpriced = coinRows.filter((c) => c.value === null).map((c) => c.code);

  // ---- History: the user's net change per coin on each entry.
  const hasNext = entries.length > PAGE_SIZE;
  const pageEntries = entries.slice(0, PAGE_SIZE);
  const metaOf = (e: { metadata: unknown }) => (e.metadata ?? {}) as Record<string, unknown>;
  const actorIds = [
    ...new Set(pageEntries.map((e) => metaOf(e).actorId).filter((x): x is string => typeof x === "string")),
  ];
  const pageAdjIds = pageEntries.filter((e) => e.type === "ADJUSTMENT").map((e) => e.id);
  const [actors, corrections, auditRows] = await Promise.all([
    db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
    db.journalEntry.findMany({
      where: { idempotencyKey: { in: pageAdjIds.map((x) => `correction:${x}`) } },
      select: { id: true, idempotencyKey: true },
    }),
    showInternal
      ? db.adminAuditLog.findMany({
          where: {
            action: { in: ["ledger.adjust", "ledger.correct"] },
            targetType: "journal_entry",
            targetId: { in: adjustmentIds.map((x) => x.id) },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const correctedBy = new Map(corrections.map((c) => [c.idempotencyKey!.slice("correction:".length), c.id]));

  const historyRows = pageEntries.map((e) => {
    const meta = metaOf(e);
    const mine = e.postings.filter((p) => p.ledgerAccount.account?.userId === u.id);
    const net = new Map<string, number>();
    // Internal transfers net to zero across the user's accounts; show the amount moved instead.
    for (const p of mine)
      if (e.type !== "TRANSFER" || Number(p.amount) > 0)
        net.set(p.assetCode, (net.get(p.assetCode) ?? 0) + Number(p.amount));
    return {
      ...e,
      label: e.type === "ADJUSTMENT" && typeof meta.customerLabel === "string" ? meta.customerLabel : words(e.type),
      actor: typeof meta.actorId === "string" ? (actorName.get(meta.actorId) ?? "Unknown staff") : null,
      correctsEntryId: typeof meta.correctsEntryId === "string" ? meta.correctsEntryId : null,
      correctedById: correctedBy.get(e.id) ?? null,
      demo: mine.some((p) => p.ledgerAccount.account?.type === "DEMO"),
      accounts: [...new Set(mine.map((p) => p.ledgerAccount.account!.name))],
      changes: [...net.entries()].filter(([, v]) => v !== 0),
    };
  });

  const requests = [
    ...transfers[0].map((d) => ({
      id: d.id,
      kind: "Deposit" as const,
      method: d.method,
      assetCode: d.assetCode,
      amount: Number(d.amount),
      status: d.status,
      note: d.failureReason,
      createdAt: d.createdAt,
    })),
    ...transfers[1].map((w) => ({
      id: w.id,
      kind: "Withdrawal" as const,
      method: w.method,
      assetCode: w.assetCode,
      amount: Number(w.amount),
      status: w.status,
      note: w.rejectionReason,
      createdAt: w.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  const latestKyc = u.kycSubmissions[0];
  const pager =
    "inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-strong";
  const jump = [
    ["#balances", "Balances"],
    ["#details", "Account & KYC"],
    ["#history", "History"],
    ...(showInternal ? [["#audit", "Adjustment log"]] : []),
    ["#security", "Security"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-muted hover:text-fg">
          ← Users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight break-words">{u.name}</h1>
        <p className="text-sm break-words text-muted">
          {u.email} · {u.phone ?? "no phone"} · joined <LocalTime date={u.createdAt.toISOString()} />
        </p>
        <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-2">
          {jump.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-fg"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="glass rounded-2xl p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-xs text-muted">Total balance</p>
          <p className="tabular mt-1 text-lg font-semibold" data-testid="admin-total-balance">
            {usd(totalUsd)}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {snapshot?.unavailable ? "Prices unavailable; USD only" : "Real accounts, live prices"}
            {unpriced.length > 0 && ` · excludes ${unpriced.join(", ")}`}
          </p>
        </div>
        {[
          ["Status", u.status, u.status === "SUSPENDED" ? "text-down" : "text-up"],
          ["Role", u.role, ""],
          ["KYC", `${u.kycStatus} (level ${u.kycLevel})`, u.kycStatus === "APPROVED" ? "text-up" : "text-warn"],
          ["2FA", u.totpEnabledAt ? "On" : "Off", u.totpEnabledAt ? "text-up" : "text-muted"],
        ].map(([k, v, c]) => (
          <div key={k} className="glass rounded-2xl p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className={cn("mt-1 font-semibold", c)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          id="balances"
          title="Balances by coin"
          description="Summed across the user's real accounts. Demo balances are virtual and never counted."
        >
          {coinRows.length === 0 ? (
            <p className="text-sm text-muted">No funds in any real account.</p>
          ) : (
            <ul className="divide-y divide-line text-sm" data-testid="admin-coin-balances">
              {coinRows.map((c) => (
                <li key={c.code} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold">{c.code}</span>{" "}
                      <span className="text-xs text-muted">{nameOf.get(c.code)}</span>
                    </span>
                    <span className="tabular shrink-0 text-right">
                      <span className="block font-semibold">{qty(c.total, decimalsOf.get(c.code))}</span>
                      <span className="block text-xs text-muted">{c.value === null ? "no price" : usd(c.value)}</span>
                    </span>
                  </div>
                  {c.byAccount.length > 1 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                      {c.byAccount.map((b) => (
                        <li key={b.name} className="flex justify-between gap-3">
                          <span className="truncate">{b.name}</span>
                          <span className="tabular">{qty(b.balance, decimalsOf.get(c.code))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
            <p className="font-medium text-fg">Accounts</p>
            <ul className="mt-1.5 space-y-1">
              {[...realAccounts, ...demoAccounts].map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    {a.name} · {a.type.toLowerCase()}
                    {a.isDefault && " · default"}
                    {a.archivedAt && " · archived"}
                  </span>
                  <span className="tabular">
                    {a.ledgerAccounts.length === 0
                      ? "Empty"
                      : a.ledgerAccounts
                          .map((l) => `${qty(Number(l.balance), l.asset.decimals)} ${l.assetCode}`)
                          .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <section className="glass min-w-0 space-y-6 rounded-2xl p-5">
          {canAdjust && realAccounts.length > 0 && (
            <ActionForm action={adjustUserBalance}>
              <h2 className="font-semibold">Add to or adjust balance</h2>
              <p className="text-xs text-muted">
                Posted as a ledger journal entry in the chosen coin&apos;s wallet. Balances are never edited directly.
              </p>
              <input type="hidden" name="userId" value={u.id} />
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-muted">
                  Account
                  <select name="accountId" className={adminInput}>
                    {realAccounts
                      .filter((a) => !a.archivedAt)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted">
                  Coin
                  <select name="assetCode" className={adminInput}>
                    {assets
                      .filter((a) => a.type === "CRYPTO")
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted">
                  Amount (+ adds, − removes)
                  <input name="amount" placeholder="+25 or -25" className={adminInput} required />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_1.4fr]">
                <label className="grid gap-1 text-xs text-muted">
                  Label the user sees
                  <select name="label" className={adminInput} defaultValue="Deposit">
                    {ADMIN_LABELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                {/* No minLength here: the ledger enforces 3 characters and returns a clear
                    message. A browser minLength blocked the submit before the server saw it. */}
                <label className="grid gap-1 text-xs text-muted">
                  Description the user sees
                  <input
                    name="description"
                    placeholder="e.g. Transfer from external BTC wallet"
                    className={adminInput}
                    required
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs text-muted">
                Internal reason (admin audit log only, never shown to the user)
                <input
                  name="reason"
                  placeholder="e.g. Ticket #1042: wire received 3 Oct, ref ABC123"
                  className={adminInput}
                  required
                />
              </label>
              <p className="text-xs text-subtle">
                A negative amount shows to the user as &ldquo;Adjustment&rdquo; unless you pick
                &ldquo;Correction&rdquo;. To undo an earlier adjustment, use &ldquo;Post correcting entry&rdquo; on it
                in the history below.
              </p>
              <button className={cn(adminButton, "bg-surface-strong")}>Post to ledger</button>
            </ActionForm>
          )}
          {can(admin, "users.suspend") && (
            <ActionForm action={setUserStatus}>
              <h2 className="font-semibold">{u.status === "SUSPENDED" ? "Reactivate account" : "Suspend account"}</h2>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="status" value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
              <input name="reason" placeholder="Reason (recorded in the audit log)" className={adminInput} required />
              <button
                className={cn(adminButton, u.status === "SUSPENDED" ? "bg-up/15 text-up" : "bg-down/15 text-down")}
              >
                {u.status === "SUSPENDED" ? "Reactivate" : "Suspend and sign out"}
              </button>
            </ActionForm>
          )}
          {can(admin, "roles.manage") && u.id !== admin.id && (
            <ActionForm action={setUserRole}>
              <h2 className="font-semibold">Role</h2>
              <input type="hidden" name="userId" value={u.id} />
              <div className="flex gap-2">
                <select name="role" defaultValue={u.role} className={adminInput} aria-label="Role">
                  {["USER", "SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className={cn(adminButton, "bg-surface-strong")}>Save</button>
              </div>
            </ActionForm>
          )}
          {can(admin, "kyc.review") && latestKyc && (
            // A single form that stays mounted once the submission is decided, so the
            // success message survives the refresh that removes the controls.
            <ActionForm action={decideKyc}>
              <h2 className="font-semibold">KYC review</h2>
              <p className="text-xs text-muted">
                {latestKyc.documentType.replace("_", " ")} issued in {latestKyc.documentCountry} ·{" "}
                <Link href={`/admin/kyc?id=${latestKyc.id}`} className="text-accent hover:underline">
                  View documents
                </Link>
              </p>
              {latestKyc.status === "PENDING" && (
                <>
                  <input type="hidden" name="submissionId" value={latestKyc.id} />
                  <input
                    name="reason"
                    placeholder="Rejection reason (shown to the customer)"
                    className={adminInput}
                    aria-label="Rejection reason"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button name="decision" value="APPROVED" className={cn(adminButton, "w-full bg-up/15 text-up")}>
                      Approve identity
                    </button>
                    <button name="decision" value="REJECTED" className={cn(adminButton, "w-full bg-down/15 text-down")}>
                      Reject
                    </button>
                  </div>
                </>
              )}
            </ActionForm>
          )}
        </section>
      </div>

      <div id="details" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">
        <Section title="Account details">
          <Fields
            rows={[
              [
                "User ID",
                <span key="id" className="font-mono text-xs">
                  {u.id}
                </span>,
              ],
              ["Name", u.name],
              [
                "Email",
                <>
                  {u.email}{" "}
                  <span className="text-xs text-muted">{u.emailVerifiedAt ? "· verified" : "· unverified"}</span>
                </>,
              ],
              [
                "Phone",
                u.phone ? (
                  <>
                    {u.phone}{" "}
                    <span className="text-xs text-muted">{u.phoneVerifiedAt ? "· verified" : "· unverified"}</span>
                  </>
                ) : (
                  "—"
                ),
              ],
              ["Status", u.status],
              ["Role", u.role],
              [
                "Two-factor",
                u.totpEnabledAt ? (
                  <>
                    On since <LocalTime date={u.totpEnabledAt.toISOString()} />
                  </>
                ) : (
                  "Off"
                ),
              ],
              ["Language", u.locale],
              ["Display currency", u.currency.toUpperCase()],
              ["Referral code", u.referralCode ?? "—"],
              [
                "Referred by",
                u.referredBy ? (
                  <Link href={`/admin/users/${u.referredBy.id}`} className="text-accent hover:underline">
                    {u.referredBy.name}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Referrals", String(u._count.referrals)],
              ["Orders placed", String(u._count.orders)],
              ["Support tickets", String(u._count.supportTickets)],
              [
                "Terms accepted",
                <>
                  {u.termsVersion} · <LocalTime date={u.termsAcceptedAt.toISOString()} />
                </>,
              ],
              ["Joined", <LocalTime key="j" date={u.createdAt.toISOString()} />],
              ["Last updated", <LocalTime key="u" date={u.updatedAt.toISOString()} />],
            ]}
          />
        </Section>

        <Section
          title="KYC details"
          description={`Status ${u.kycStatus} · level ${u.kycLevel} · ${u.kycSubmissions.length} submission${u.kycSubmissions.length === 1 ? "" : "s"}`}
        >
          {u.kycSubmissions.length === 0 ? (
            <p className="text-sm text-muted">No identity documents submitted yet.</p>
          ) : (
            <ul className="space-y-3">
              {u.kycSubmissions.map((k) => (
                <li key={k.id} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        k.status === "APPROVED" ? "text-up" : k.status === "REJECTED" ? "text-down" : "text-warn",
                      )}
                    >
                      {k.status}
                    </span>
                    <Link href={`/admin/kyc?id=${k.id}`} className="text-xs text-accent hover:underline">
                      View documents
                    </Link>
                  </div>
                  <Fields
                    rows={[
                      ["Document", words(k.documentType)],
                      ["Issuing country", k.documentCountry],
                      ["Files", k.files.map((f) => words(f.kind)).join(", ") || "—"],
                      ["Submitted", <LocalTime key="s" date={k.submittedAt.toISOString()} />],
                      [
                        "Reviewed",
                        k.reviewedAt ? (
                          <>
                            <LocalTime date={k.reviewedAt.toISOString()} />
                            {k.reviewer && ` by ${k.reviewer.name}`}
                          </>
                        ) : (
                          "Not yet"
                        ),
                      ],
                      ...(k.rejectionReason
                        ? ([
                            [
                              "Rejection reason",
                              <span key="r" className="text-down">
                                {k.rejectionReason}
                              </span>,
                            ],
                          ] as [string, React.ReactNode][])
                        : []),
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        id="history"
        title="Transaction history"
        description={`Every ledger entry on this user's accounts (${entryCount} in total), newest first.`}
      >
        {historyRows.length === 0 ? (
          <p className="text-sm text-muted">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm" data-testid="admin-history">
            {historyRows.map((e) => (
              <li key={e.id} className="py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {e.label}
                      {e.label.toUpperCase() !== e.type && (
                        <span className="ml-2 font-mono text-xs font-normal text-muted">{e.type}</span>
                      )}
                      {e.demo && <span className="ml-2 text-xs font-normal text-warn">demo</span>}
                    </p>
                    <p className="break-words text-muted">{e.description}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      <LocalTime date={e.createdAt.toISOString()} />
                      {e.accounts.length > 0 && ` · ${e.accounts.join(", ")}`} ·{" "}
                      <span className="font-mono">{e.id.slice(-10)}</span>
                    </p>
                  </div>
                  <div className="tabular shrink-0 text-right font-semibold">
                    {e.changes.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      e.changes.map(([asset, amount]) => (
                        <span
                          key={asset}
                          className={cn("block", e.type !== "TRANSFER" && (amount >= 0 ? "text-up" : "text-down"))}
                        >
                          {e.type === "TRANSFER" ? "" : amount >= 0 ? "+" : "−"}
                          {qty(Math.abs(amount), decimalsOf.get(asset))} {asset}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {e.type === "ADJUSTMENT" && (
                  <div className="mt-2 space-y-1 rounded-lg bg-surface px-3 py-2 text-xs">
                    <p className="text-muted">
                      By <span className="text-fg">{e.actor ?? "staff"}</span>
                      {showInternal && e.reason && (
                        <>
                          {" "}
                          · Internal reason: <span className="text-warn">{e.reason}</span>
                        </>
                      )}
                    </p>
                    {e.correctsEntryId && (
                      <p className="text-muted">
                        Correcting entry for <span className="font-mono">{e.correctsEntryId.slice(-10)}</span>
                      </p>
                    )}
                    {e.correctedById && (
                      <p className="text-warn">
                        Corrected by entry <span className="font-mono">{e.correctedById.slice(-10)}</span>
                      </p>
                    )}
                    {canAdjust && !e.correctsEntryId && e.changes.length > 0 && (
                      // The form stays mounted once corrected, so its success message survives
                      // the refresh that removes the controls.
                      <ActionForm action={correctUserAdjustment}>
                        {!e.correctedById && (
                          <details className="space-y-3">
                            <summary className="cursor-pointer font-medium text-accent">Post correcting entry</summary>
                            <p className="text-muted">
                              Posts the exact opposite (
                              {e.changes
                                .map(
                                  ([asset, amount]) =>
                                    `${amount >= 0 ? "−" : "+"}${qty(Math.abs(amount), decimalsOf.get(asset))} ${asset}`,
                                )
                                .join(", ")}
                              ). The user sees it as &ldquo;Correction&rdquo;; the original stays in their history.
                            </p>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="entryId" value={e.id} />
                            <label className="grid gap-1 text-muted">
                              Description the user sees
                              <input
                                name="description"
                                defaultValue={`Correction of an earlier ${e.label.toLowerCase()}`}
                                className={adminInput}
                                required
                              />
                            </label>
                            <label className="grid gap-1 text-muted">
                              Internal reason (admin audit log only)
                              <input
                                name="reason"
                                placeholder="Why this is being corrected"
                                className={adminInput}
                                required
                              />
                            </label>
                            <button className={cn(adminButton, "bg-surface-strong")}>Post correction</button>
                          </details>
                        )}
                      </ActionForm>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {(page > 1 || hasNext) && (
          <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="History pages">
            {page > 1 ? (
              <Link href={`?page=${page - 1}#history`} className={pager}>
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">
              Page {page} of {Math.max(1, Math.ceil(entryCount / PAGE_SIZE))}
            </span>
            {hasNext ? (
              <Link href={`?page=${page + 1}#history`} className={pager}>
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {showInternal && (
          <Section
            id="audit"
            title="Balance adjustment log"
            description="Private admin audit trail for this user's adjustments and corrections. Never shown to the user."
          >
            {auditRows.length === 0 ? (
              <p className="text-sm text-muted">No adjustments recorded.</p>
            ) : (
              <ul className="divide-y divide-line text-sm" data-testid="admin-adjustment-log">
                {auditRows.map((r) => {
                  const d = (r.details ?? {}) as Record<string, unknown>;
                  const amount = typeof d.amount === "string" ? d.amount : "";
                  const asset = typeof d.assetCode === "string" ? d.assetCode : "";
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold">
                          {typeof d.adminName === "string" ? d.adminName : r.actor.name}
                          <span className="ml-2 font-mono text-xs font-normal text-muted">{r.action}</span>
                        </span>
                        <span className={cn("tabular font-semibold", amount.startsWith("-") ? "text-down" : "text-up")}>
                          {amount && !amount.startsWith("-") && !amount.startsWith("+") ? "+" : ""}
                          {amount ? `${qty(Number(amount), decimalsOf.get(asset))} ${asset}` : "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs break-words text-warn">
                        Reason: {typeof d.reason === "string" && d.reason ? d.reason : "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        <LocalTime date={r.createdAt.toISOString()} />
                        {typeof d.label === "string" && d.label && ` · shown as “${d.label}”`}
                        {r.ip && ` · ${r.ip}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <Section
          title="Deposit & withdrawal requests"
          description="Latest requests and their status. Completed ones also appear in the history above."
          className={cn(!showInternal && "lg:col-span-2")}
        >
          {requests.length === 0 ? (
            <p className="text-sm text-muted">No deposit or withdrawal requests.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{r.kind}</span>{" "}
                    <span className="text-xs text-muted">
                      {words(r.method)} · {words(r.status)}
                    </span>
                    {r.note && <span className="block text-xs text-down">{r.note}</span>}
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="block font-medium">
                      {qty(r.amount, decimalsOf.get(r.assetCode))} {r.assetCode}
                    </span>
                    <span className="block text-xs text-muted">
                      <LocalTime date={r.createdAt.toISOString()} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section id="security" title="Security log" description="Latest 10 sign-in and security events.">
        <ul className="divide-y divide-line text-sm">
          {u.securityEvents.map((e) => (
            <li key={e.id} className="py-2">
              <span className={cn("text-xs font-semibold", e.type.includes("FAILED") && "text-down")}>{e.type}</span>
              <span className="block text-xs text-muted">
                {[e.device, e.ip, e.location].filter(Boolean).join(" · ")} ·{" "}
                <LocalTime date={e.createdAt.toISOString()} />
              </span>
            </li>
          ))}
          {u.securityEvents.length === 0 && <li className="py-2 text-muted">No events yet.</li>}
        </ul>
      </Section>
    </div>
  );
}
