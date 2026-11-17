import type { ReactNode } from 'react';

export const LEGAL_UPDATED = 'November 17, 2026';

/** The contact address for privacy and legal requests (NEXT_PUBLIC_CONTACT_EMAIL). */
export function contactEmail() {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
}

export function ContactLine() {
  const email = contactEmail();
  return email ? (
    <a href={`mailto:${email}`} className='underline underline-offset-4'>
      {email}
    </a>
  ) : (
    <>the contact address on our website</>
  );
}

/** Long-form reading layout for the privacy policy and terms. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className='mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24'>
      <h1 className='font-display text-4xl font-bold tracking-[-0.035em]'>{title}</h1>
      <p className='mt-3 text-sm text-muted-foreground'>Last updated {LEGAL_UPDATED}</p>
      <div className='mt-10 space-y-5 leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:pt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-foreground'>
        {children}
      </div>
    </article>
  );
}
