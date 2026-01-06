import { Button } from '@/components/ui/button';
import Image from 'next/image';

export const SocialLoginButtons = () => {
  return (
    <div className='space-y-4'>
      <Button variant='outline' size='lg' className='w-full'>
        <Image src='/google.svg' width={20} height={20} alt='Google logo' />
        Continue with Google
      </Button>
    </div>
  );
};
