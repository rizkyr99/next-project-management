'use client';

import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  cameraOff?: boolean;
}

export function VideoTile({ stream, name, muted = false, cameraOff = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className='relative rounded-lg overflow-hidden bg-muted flex items-center justify-center aspect-video'>
      {cameraOff || !stream ? (
        <div className='flex flex-col items-center gap-2 text-muted-foreground'>
          <div className='w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold text-primary'>
            {name.charAt(0).toUpperCase()}
          </div>
          <span className='text-xs'>{name}</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className='w-full h-full object-cover'
        />
      )}
      <span className='absolute bottom-2 left-2 text-xs bg-black/50 text-white px-1.5 py-0.5 rounded'>
        {name}
      </span>
    </div>
  );
}
