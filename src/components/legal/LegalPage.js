import { cookies, headers } from "next/headers";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n-config";
import { readLegal, legalDoc, LEGAL_UPDATED } from "@/lib/legal";

const LABELS = {
  en: { privacy: "Privacy Policy", terms: "Terms of Use", updated: "Last updated: ", contents: "Contents", signIn: "Sign in" },
  "zh-CN": { privacy: "隐私政策", terms: "使用条款", updated: "最后更新：", contents: "目录", signIn: "登录" },
};

/** ?lang= first (the App Store listing and the apps ask for a language), then the language picked in the portal, then the browser's. */
async function pickLocale(searchParams) {
  const asked = String((await searchParams)?.lang ?? "");
  if (/^zh/i.test(asked)) return "zh-CN";
  if (/^en/i.test(asked)) return "en";
  const picked = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (picked && LOCALES[picked]) return picked;
  return /^\s*zh/i.test((await headers()).get("accept-language") ?? "") ? "zh-CN" : "en";
}

/** The address readers reached the portal at, named in the texts. */
async function originOf() {
  const env = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export async function legalMetadata(kind, searchParams) {
  const locale = await pickLocale(searchParams);
  return { title: LABELS[locale][kind], alternates: { languages: { en: `/${kind}?lang=en`, "zh-CN": `/${kind}?lang=zh-CN` } } };
}

/** The contact address as a mailto link wherever a text names it. */
function withMail(text, mail) {
  if (!mail || !text.includes(mail)) return text;
  return text.split(mail).flatMap((part, i) => (i ? [<a key={i} href={`mailto:${mail}`} className="text-accent hover:underline">{mail}</a>, part] : [part]));
}

/** /privacy and /terms: public, no session needed, English or Chinese. The texts live in lib/legal.js. */
export default async function LegalPage({ kind, searchParams }) {
  const locale = await pickLocale(searchParams);
  const L = LABELS[locale];
  const legal = await readLegal();
  const doc = legalDoc(kind, locale, legal, await originOf());
  const other = kind === "privacy" ? "terms" : "privacy";
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LEGAL_UPDATED}T00:00:00Z`));
  const text = (t) => withMail(t, legal.contact_email);
  return (
    <div lang={locale} className={`legal-page legal-${kind} min-h-dvh`}>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={26} /> <span>Task Portal</span></Link>
          <nav className="ml-auto flex items-center gap-1 text-xs">
            {Object.entries(LOCALES).map(([code, name]) => (
              <a key={code} href={`/${kind}?lang=${code}`} lang={code} aria-current={code === locale ? "page" : undefined} className={`rounded-md px-2 py-1 ${code === locale ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:text-fg"}`}>{name}</a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{doc.title}</h1>
        <p className="mt-2 text-sm text-fg-faint">{L.updated}<time dateTime={LEGAL_UPDATED}>{date}</time></p>
        <p className="mt-5 text-[15px] leading-relaxed text-fg-muted">{text(doc.intro)}</p>

        <nav aria-label={L.contents} className="mt-6 rounded-app border border-line bg-surface/60 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{L.contents}</p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {doc.sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="text-fg-muted hover:text-accent">{i + 1}. {s.title}</a></li>)}
          </ol>
        </nav>

        <div className="mt-10 space-y-9">
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="text-lg font-semibold tracking-tight text-fg">{i + 1}. {s.title}</h2>
              <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-fg-muted">
                {s.body.map((b, j) => (typeof b === "string" ? <p key={j}>{text(b)}</p> : (
                  <ul key={j} className="list-disc space-y-2 pl-5 marker:text-fg-faint">{b.list.map((item, k) => <li key={k}>{text(item)}</li>)}</ul>
                )))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-6 text-sm text-fg-faint">
          <Link href={`/${other}?lang=${locale}`} className="hover:text-fg">{L[other]}</Link>
          <Link href="/login" className="hover:text-fg">{L.signIn}</Link>
        </footer>
      </main>
    </div>
  );
}
