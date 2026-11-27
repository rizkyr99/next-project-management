'use client';

import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  cameraOff?: boolean;
  /** I12: a shared screen: shown whole (not cropped), with a full-screen button. */
  screen?: boolean;
}

export function VideoTile({ stream, name, muted = false, cameraOff = false, screen = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, cameraOff, screen]);

  const label = screen ? `${name}: screen` : name;
  const showVideo = stream && (screen || !cameraOff);

  return (
    <div
      className='relative rounded-lg overflow-hidden bg-muted flex items-center justify-center aspect-video'
      data-testid={screen ? 'screen-tile' : undefined}>
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          aria-label={label}
          className={screen ? 'w-full h-full object-contain bg-black' : 'w-full h-full object-cover'}
        />
      ) : (
        <div className='flex flex-col items-center gap-2 text-muted-foreground'>
          <div className='w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold text-primary'>
            {name.charAt(0).toUpperCase()}
          </div>
          <span className='text-xs'>{name}</span>
        </div>
      )}
      <span className='absolute bottom-2 left-2 text-xs bg-black/50 text-white px-1.5 py-0.5 rounded'>{label}</span>
      {screen && showVideo && (
        <Button
          type='button'
          size='icon'
          variant='secondary'
          className='absolute top-2 right-2 size-7 opacity-80 hover:opacity-100'
          aria-label={`View ${name}’s screen full screen`}
          title='Full screen'
          onClick={() => void videoRef.current?.requestFullscreen?.()}>
          <Maximize2 className='size-3.5' />
        </Button>
      )}
    </div>
  );
}
