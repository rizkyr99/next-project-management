import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className='mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6'>
      <Link href='/' aria-label='Tide home' className='rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'>
        <Logo />
      </Link>
      <nav aria-label='Main' className='flex items-center gap-1 sm:gap-2'>
        <Button asChild variant='ghost' size='sm' className='hidden sm:inline-flex'>
          <Link href='/pricing'>Pricing</Link>
        </Button>
        <Button asChild variant='ghost' size='sm'>
          <Link href='/login'>Log in</Link>
        </Button>
        <Button asChild size='sm'>
          <Link href='/register'>Start free trial</Link>
        </Button>
      </nav>
    </header>
  );
}
