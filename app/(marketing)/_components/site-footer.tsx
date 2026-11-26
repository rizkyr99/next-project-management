import { Logo } from '@/components/brand/logo';
import Link from 'next/link';
import { SITE_TAGLINE } from '@/lib/site';

const LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/login', label: 'Log in' },
];

export function SiteFooter() {
  return (
    <footer className='border-t'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <div className='space-y-2'>
          <Logo />
          <p className='text-sm text-muted-foreground'>{SITE_TAGLINE}.</p>
        </div>
        <nav aria-label='Footer'>
          <ul className='flex flex-wrap gap-x-6 gap-y-2 text-sm'>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className='text-muted-foreground hover:text-foreground'>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
