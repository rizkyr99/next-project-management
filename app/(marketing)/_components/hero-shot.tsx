import { getImageProps } from 'next/image';
import boardDark from '@/public/marketing/board-dark.webp';
import boardDarkMobile from '@/public/marketing/board-dark-mobile.webp';
import boardLight from '@/public/marketing/board-light.webp';
import boardLightMobile from '@/public/marketing/board-light-mobile.webp';

const PHONE = '(max-width: 639px)';

/**
 * The hero board screenshot, art-directed: phones get a pre-cropped image of
 * just the columns (legible and small), wider screens the whole board. The
 * light version is the page's LCP image, so it's fetched at high priority;
 * the dark version only loads in dark mode.
 */
export function HeroShot() {
  return (
    <>
      <Shot
        alt='A Tide board for a spring launch: To Do, In Progress, Review and Done columns with tasks, priorities, due dates and assignees.'
        desktop={boardLight}
        mobile={boardLightMobile}
        className='block dark:hidden'
        eager
      />
      <Shot alt='The same Tide board in dark mode.' desktop={boardDark} mobile={boardDarkMobile} className='hidden dark:block' />
    </>
  );
}

function Shot({
  alt,
  desktop,
  mobile,
  className,
  eager,
}: {
  alt: string;
  desktop: typeof boardLight;
  mobile: typeof boardLight;
  className: string;
  eager?: boolean;
}) {
  const common = { alt } as const;
  const {
    props: { srcSet: mobileSrcSet },
  } = getImageProps({ ...common, src: mobile, sizes: 'calc(100vw - 32px)' });
  const { props } = getImageProps({
    ...common,
    src: desktop,
    sizes: '(min-width: 1152px) 1104px, calc(100vw - 48px)',
    loading: eager ? 'eager' : 'lazy',
    fetchPriority: eager ? 'high' : 'auto',
  });
  return (
    <picture className={className}>
      <source media={PHONE} srcSet={mobileSrcSet} sizes='calc(100vw - 32px)' />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt is in props */}
      <img {...props} className='block h-auto w-full' />
    </picture>
  );
}
