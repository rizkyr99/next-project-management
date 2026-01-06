import Link from 'next/link';

interface AuthPageHeaderProps {
  title: string;
  subtitle: string;
  linkText: string;
  linkHref: string;
}

export function AuthPageHeader({
  title,
  subtitle,
  linkText,
  linkHref,
}: AuthPageHeaderProps) {
  return (
    <div className='flex flex-col items-center justify-center space-y-4'>
      <div className='text-4xl font-extrabold text-primary'>tide</div>
      <div>
        <h1 className='text-xl font-bold text-center'>{title}</h1>
        <p className='text-sm text-center text-muted-foreground'>
          {subtitle}{' '}
          <Link href={linkHref} className='text-blue-500'>
            {linkText}
          </Link>
        </p>
      </div>
    </div>
  );
}
