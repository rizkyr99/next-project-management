'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { AVATAR_SIZE } from '../avatar';
import { removeAvatar, uploadAvatar } from '../avatar-actions';

/** A centred square of the photo, AVATAR_SIZE wide, as WebP (or JPEG where WebP can't be made). */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Could not encode');
  return jpeg;
}

/** I11: your photo on the account page: upload a new one or go back to initials. */
export function ProfilePhoto({
  image,
  name,
  email,
  initials,
}: Readonly<{ image: string | null; name: string; email: string; initials: string }>) {
  const router = useRouter();
  // The header reads the photo from the client session; refresh it too.
  const { refetch: refetchSession } = authClient.useSession();
  const input = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(image);
  const [isPending, startTransition] = useTransition();

  const choose = (file: File | undefined) => {
    if (!file) return;
    startTransition(async () => {
      let photo: Blob;
      try {
        photo = await squarePhoto(file);
      } catch {
        toast.error('That file couldn’t be read as an image. Try a PNG, JPEG or WebP.', { position: 'top-center' });
        return;
      }
      const form = new FormData();
      form.set('photo', photo, photo.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
      const result = await uploadAvatar(form);
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      setShown(result.image);
      toast.success('Photo updated', { position: 'top-center' });
      router.refresh();
      void refetchSession();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await removeAvatar();
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      setShown(null);
      toast.success('Photo removed', { position: 'top-center' });
      router.refresh();
      void refetchSession();
    });

  return (
    <div className='flex flex-wrap items-center gap-4'>
      <Avatar className='size-16'>
        {shown && <AvatarImage src={shown} alt='' referrerPolicy='no-referrer' />}
        <AvatarFallback className='text-lg'>{initials}</AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1'>
        <p className='font-medium'>{name}</p>
        <p className='truncate text-sm text-muted-foreground'>{email}</p>
      </div>
      <div className='flex gap-2'>
        <input
          ref={input}
          type='file'
          accept='image/png,image/jpeg,image/gif,image/webp'
          className='sr-only'
          tabIndex={-1}
          aria-label='Profile photo file'
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button type='button' variant='outline' size='sm' disabled={isPending} onClick={() => input.current?.click()}>
          <Camera />
          {shown ? 'Change photo' : 'Upload photo'}
        </Button>
        {shown && (
          <Button type='button' variant='ghost' size='sm' disabled={isPending} onClick={remove}>
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
