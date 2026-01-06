import Link from 'next/link';
import React from 'react';

export function AuthPageHeader() {
  return (
    <div className='flex flex-col items-center justify-center space-y-4'>
      <div className='text-4xl font-extrabold text-primary'>tide</div>
      <div>
        <h1 className='text-xl font-bold text-center'>Welcome back!</h1>
        <p className='text-sm text-center text-muted-foreground'>
          Don&apos;t have an account?{' '}
          <Link href='/register' className='text-blue-500'>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
