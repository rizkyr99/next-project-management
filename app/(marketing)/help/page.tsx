import { HELP_ARTICLES } from '@/features/help/articles';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help',
  description: 'How to set up Tide, work with clients, use templates, and how plans, billing and the trial work.',
  alternates: { canonical: '/help' },
};

/** E5: the help centre's index. */
export default function HelpPage() {
  return (
    <div className='mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24'>
      <h1 className='font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl'>Help</h1>
      <p className='mt-4 max-w-[60ch] text-lg text-muted-foreground'>
        Short guides to the parts of Tide studios ask about most. In the app, the ? menu in the header has these
        too, and a way to send us feedback.
      </p>
      <ul aria-label='Guides' className='mt-12 divide-y border-y'>
        {HELP_ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link href={`/help/${a.slug}`} className='group flex items-center gap-4 py-6'>
              <span className='min-w-0 flex-1'>
                <span className='block font-display text-xl font-bold tracking-[-0.02em] group-hover:underline underline-offset-4'>
                  {a.title}
                </span>
                <span className='mt-1 block text-muted-foreground'>{a.summary}</span>
              </span>
              <ArrowRight className='size-5 shrink-0 text-muted-foreground' aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
