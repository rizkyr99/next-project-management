import { cn } from '@/lib/utils';

/** Tide's mark: two waves in an indigo square. Same drawing as app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 32 32' aria-hidden className={cn('size-7 shrink-0', className)}>
      <rect width='32' height='32' rx='8' fill='#3346DB' />
      <path
        d='M7 13.5c2.25 0 2.25-2.5 4.5-2.5s2.25 2.5 4.5 2.5 2.25-2.5 4.5-2.5 2.25 2.5 4.5 2.5'
        fill='none'
        stroke='#fff'
        strokeWidth='2.4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M7 20.5c2.25 0 2.25-2.5 4.5-2.5s2.25 2.5 4.5 2.5 2.25-2.5 4.5-2.5 2.25 2.5 4.5 2.5'
        fill='none'
        stroke='#fff'
        strokeOpacity='0.6'
        strokeWidth='2.4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className='font-display text-[1.375rem] font-extrabold tracking-[-0.04em] leading-none'>tide</span>
    </span>
  );
}
