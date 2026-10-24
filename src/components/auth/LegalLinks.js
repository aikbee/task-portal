"use client";
import { Fragment } from "react";
import { useT } from "@/lib/i18n";

const PAGES = { privacy: ["/privacy", "Privacy Policy"], terms: ["/terms", "Terms of Use"] };

/** "Privacy Policy · Terms of Use" under the signed-out screens. */
export function LegalFooter() {
  const tr = useT();
  return (
    <p className="legal-links mt-3 flex items-center justify-center gap-2 text-xs text-fg-muted">
      <a href={PAGES.privacy[0]} target="_blank" rel="noopener" className="hover:text-fg">{tr(PAGES.privacy[1])}</a>
      <span className="text-fg-faint">·</span>
      <a href={PAGES.terms[0]} target="_blank" rel="noopener" className="hover:text-fg">{tr(PAGES.terms[1])}</a>
    </p>
  );
}

/** The line under the button that creates an account, with both documents linked inside the translated sentence. */
export function AgreeLine() {
  const tr = useT();
  const parts = tr("By continuing, you agree to the {terms} and the {privacy}.").split(/\{(terms|privacy)\}/);
  return (
    <p className="legal-agree text-center text-xs leading-relaxed text-fg-muted">
      {parts.map((part, i) => (i % 2 ? (
        <a key={i} href={PAGES[part][0]} target="_blank" rel="noopener" className="text-accent hover:underline">{tr(PAGES[part][1])}</a>
      ) : <Fragment key={i}>{part}</Fragment>))}
    </p>
  );
}
