'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

export const SocialLoginButtons = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await authClient.signIn.social(
        {
          provider: 'google',
          callbackURL: '/',
        },
        {
          onSuccess: (ctx) => {
            const url = ctx.data?.url;
            if (url) {
              window.location.href = url;
              return;
            }

            toast.success('Login successful!', { position: 'top-center' });
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || 'Failed to login with Google', {
              position: 'top-center',
            });
          },
        },
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      <Button
        variant='outline'
        size='lg'
        className='w-full'
        onClick={handleGoogleLogin}
        disabled={isLoading}>
        <Image src='/google.svg' width={20} height={20} alt='Google logo' />
        {isLoading ? 'Connecting to Google...' : 'Continue with Google'}
      </Button>
    </div>
  );
};
