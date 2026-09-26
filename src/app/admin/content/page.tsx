import Link from "next/link";
import { Star } from "lucide-react";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm, adminButton, adminInput } from "@/components/admin/action-form";
import { cn } from "@/lib/utils";
import { createPromotion, deleteFaq, moderateTestimonial, saveArticle, saveFaq, togglePromotion } from "../actions";

export const metadata = { title: "Content" };

const TABS = ["testimonials", "promotions", "articles", "faq"] as const;

export default async function AdminContent({ searchParams }: PageProps<"/admin/content">) {
  await requirePermission("content.manage");
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? (sp.tab as (typeof TABS)[number]) : "testimonials";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <nav className="flex gap-1 overflow-x-auto" aria-label="Content sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/content?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm capitalize",
              tab === t ? "bg-surface-strong font-medium" : "text-muted hover:bg-surface",
            )}
          >
            {t === "faq" ? "FAQ" : t}
          </Link>
        ))}
      </nav>
      {tab === "testimonials" && <Testimonials />}
      {tab === "promotions" && <Promotions />}
      {tab === "articles" && <Articles editId={typeof sp.edit === "string" ? sp.edit : undefined} />}
      {tab === "faq" && <Faq />}
    </div>
  );
}

async function Testimonials() {
  const rows = await db.testimonial.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { user: { select: { email: true, kycStatus: true } } },
  });
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        Reviews are submitted by signed-in customers. Approve only genuine reviews; never edit their wording.
      </p>
      {rows.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No reviews submitted yet.</p>}
      {rows.map((t) => (
        <div key={t.id} className="glass rounded-2xl p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-bold",
                t.status === "APPROVED"
                  ? "bg-up/15 text-up"
                  : t.status === "REJECTED"
                    ? "bg-down/15 text-down"
                    : "bg-warn/15 text-warn",
              )}
            >
              {t.status}
            </span>
            <span className="flex">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn("h-3.5 w-3.5", i < t.rating ? "fill-warn text-warn" : "text-line-strong")}
                />
              ))}
            </span>
            <span className="font-medium">{t.displayName}</span>
            <span className="text-xs text-muted">
              {t.user.email} · KYC {t.user.kycStatus}
            </span>
          </div>
          <p className="mt-2">&ldquo;{t.body}&rdquo;</p>
          {t.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              {(["APPROVED", "REJECTED"] as const).map((d) => (
                <form key={d} action={moderateTestimonial}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="decision" value={d} />
                  <button className={cn(adminButton, d === "APPROVED" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>
                    {d === "APPROVED" ? "Approve" : "Reject"}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

async function Promotions() {
  const promos = await db.promotion.findMany({ orderBy: { startsAt: "desc" }, take: 20 });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass rounded-2xl p-5">
        <ActionForm action={createPromotion}>
          <h2 className="font-semibold">New countdown banner</h2>
          <input
            name="message"
            placeholder="Message, e.g. Zero fees on BTC this weekend"
            className={adminInput}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input name="ctaLabel" placeholder="Link label (optional)" className={adminInput} />
            <input name="ctaHref" placeholder="/#fees or https://…" className={adminInput} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Starts
              <input name="startsAt" type="datetime-local" className={adminInput} required />
            </label>
            <label className="text-xs text-muted">
              Ends
              <input name="endsAt" type="datetime-local" className={adminInput} required />
            </label>
          </div>
          <button className={cn(adminButton, "bg-brand text-white")}>Create promotion</button>
        </ActionForm>
      </section>
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold">Promotions</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {promos.length === 0 && <li className="py-2 text-muted">None yet.</li>}
          {promos.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.message}</p>
                <p className="text-xs text-muted">
                  <LocalTime date={p.startsAt.toISOString()} /> → <LocalTime date={p.endsAt.toISOString()} />
                </p>
              </div>
              <form action={togglePromotion}>
                <input type="hidden" name="id" value={p.id} />
                <button className={cn(adminButton, p.active ? "bg-up/15 text-up" : "bg-surface-strong text-muted")}>
                  {p.active ? "Active" : "Paused"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function Articles({ editId }: { editId?: string }) {
  const [articles, editing] = await Promise.all([
    db.article.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, kind: true, title: true, status: true, slug: true },
    }),
    editId ? db.article.findUnique({ where: { id: editId } }) : null,
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <section className="glass h-fit rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Blog &amp; academy</h2>
          <Link href="/admin/content?tab=articles" className="text-sm text-accent">
            + New
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line text-sm">
          {articles.length === 0 && <li className="py-2 text-muted">No articles yet.</li>}
          {articles.map((a) => (
            <li key={a.id} className="py-2">
              <Link href={`/admin/content?tab=articles&edit=${a.id}`} className="font-medium hover:text-accent">
                {a.title}
              </Link>
              <span className="block text-xs text-muted">
                {a.kind} · {a.status} · /{a.slug}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="glass rounded-2xl p-5">
        <ActionForm action={saveArticle} key={editing?.id ?? "new"}>
          <h2 className="font-semibold">{editing ? "Edit article" : "New article"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid grid-cols-3 gap-2">
            <select name="kind" defaultValue={editing?.kind ?? "BLOG"} className={adminInput} aria-label="Kind">
              <option value="BLOG">Blog</option>
              <option value="ACADEMY">Academy</option>
            </select>
            <input
              name="category"
              defaultValue={editing?.category}
              placeholder="Category"
              className={adminInput}
              required
            />
            <input
              name="level"
              defaultValue={editing?.level ?? ""}
              placeholder="Level (academy)"
              className={adminInput}
            />
          </div>
          <input name="title" defaultValue={editing?.title} placeholder="Title" className={adminInput} required />
          <input name="slug" defaultValue={editing?.slug} placeholder="url-slug" className={adminInput} required />
          <textarea
            name="excerpt"
            defaultValue={editing?.excerpt}
            placeholder="Short summary"
            rows={2}
            className={`${adminInput} h-auto py-2`}
            required
          />
          <textarea
            name="body"
            defaultValue={editing?.body}
            placeholder="Article body (Markdown)"
            rows={12}
            className={`${adminInput} h-auto py-2 font-mono text-xs`}
            required
          />
          <div className="flex gap-2">
            <select
              name="status"
              defaultValue={editing?.status ?? "DRAFT"}
              className={`${adminInput} w-40`}
              aria-label="Status"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <button className={cn(adminButton, "bg-brand text-white")}>Save article</button>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

async function Faq() {
  const items = await db.faqItem.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass rounded-2xl p-5">
        <ActionForm action={saveFaq}>
          <h2 className="font-semibold">Add a question</h2>
          <p className="text-xs text-muted">
            Once any FAQ entry exists, the landing page shows these instead of the built-in questions.
          </p>
          <input name="question" placeholder="Question" className={adminInput} required />
          <textarea name="answer" placeholder="Answer" rows={4} className={`${adminInput} h-auto py-2`} required />
          <input
            name="sortOrder"
            type="number"
            defaultValue={items.length * 10}
            className={`${adminInput} w-32`}
            aria-label="Sort order"
          />
          <button className={cn(adminButton, "bg-brand text-white")}>Add</button>
        </ActionForm>
      </section>
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold">Questions</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {items.length === 0 && <li className="py-2 text-muted">None. The landing page shows the built-in FAQ.</li>}
          {items.map((f) => (
            <li key={f.id} className="flex gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.question}</p>
                <p className="line-clamp-2 text-xs text-muted">{f.answer}</p>
              </div>
              <form action={deleteFaq}>
                <input type="hidden" name="id" value={f.id} />
                <button className="text-xs text-muted hover:text-down">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
