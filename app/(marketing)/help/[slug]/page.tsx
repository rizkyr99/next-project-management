import { HELP_ARTICLES, helpArticle } from '@/features/help/articles';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = helpArticle((await params).slug);
  if (!article) return {};
  return {
    title: `${article.title} · Help`,
    description: article.summary,
    alternates: { canonical: `/help/${article.slug}` },
  };
}

/** E5: one help article. */
export default async function HelpArticlePage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const article = helpArticle((await params).slug);
  if (!article) notFound();
  const others = HELP_ARTICLES.filter((a) => a.slug !== article.slug);

  return (
    <article className='mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24'>
      <Link
        href='/help'
        className='inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'>
        <ArrowLeft className='size-4' aria-hidden />
        All guides
      </Link>
      <h1 className='mt-6 font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl'>{article.title}</h1>
      <p className='mt-4 max-w-[60ch] text-lg text-muted-foreground'>{article.summary}</p>

      <div className='mt-12 space-y-12'>
        {article.sections.map((section) => (
          <section key={section.heading} aria-labelledby={`h-${section.heading}`} className='space-y-4'>
            <h2
              id={`h-${section.heading}`}
              className='font-display text-2xl font-bold tracking-[-0.02em]'>
              {section.heading}
            </h2>
            {section.steps && (
              <ol className='list-decimal space-y-2 pl-6 leading-relaxed text-foreground/90 marker:text-muted-foreground'>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.paragraphs?.map((p) => (
              <p key={p} className='max-w-[68ch] leading-relaxed text-foreground/90'>
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <nav aria-label='More guides' className='mt-16 border-t pt-8'>
        <h2 className='text-sm font-medium text-muted-foreground'>More guides</h2>
        <ul className='mt-3 space-y-2'>
          {others.map((a) => (
            <li key={a.slug}>
              <Link href={`/help/${a.slug}`} className='underline-offset-4 hover:underline'>
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className='mt-8 text-sm text-muted-foreground'>
          Still stuck? In the app, open the ? menu in the header and choose Send feedback. A person reads every
          message.
        </p>
      </nav>
    </article>
  );
}
