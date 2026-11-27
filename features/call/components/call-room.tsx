'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VideoTile } from './video-tile';
import { RemoteStream } from '../hooks/use-webrtc';
import type { Participant } from '../hooks/use-call-stream';
import { MAX_CALL_PARTICIPANTS } from '../schema';

interface CallRoomProps {
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  participants: Participant[];
  currentUserId: string;
  currentUserName: string;
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  /** I12: my shared screen, if I'm sharing; who else is. Null when this browser can't share. */
  screenStream: MediaStream | null;
  sharingUserIds: string[];
  onToggleScreen: (() => void) | null;
}

export function CallRoom({
  localStream,
  remoteStreams,
  participants,
  currentUserId,
  currentUserName,
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onLeave,
  screenStream,
  sharingUserIds,
  onToggleScreen,
}: CallRoomProps) {
  const isSharing = (id: string) => sharingUserIds.includes(id);
  // Someone sharing comes first, so their screen is the big thing to look at.
  const remoteParticipants = participants
    .filter((p) => p.userId !== currentUserId)
    .sort((a, b) => Number(isSharing(b.userId)) - Number(isSharing(a.userId)));
  const anyoneSharing = Boolean(screenStream) || remoteParticipants.some((p) => isSharing(p.userId));

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col',
        // A shared screen needs room to be readable.
        anyoneSharing ? 'w-[min(36rem,calc(100vw-2rem))]' : 'w-80',
      )}>
      <div className='p-2 border-b flex items-center justify-between'>
        <span className='text-sm font-medium'>
          Call · {participants.length} of {MAX_CALL_PARTICIPANTS}
        </span>
        <Badge variant='secondary' title='Calls are new. Video may not connect on some networks.'>
          Beta
        </Badge>
      </div>

      <div className={cn('p-2 flex flex-col gap-2 overflow-y-auto', anyoneSharing ? 'max-h-[70vh]' : 'max-h-96')}>
        {/* Remote videos (a shared screen first) */}
        {remoteParticipants.map((p) => {
          const rs = remoteStreams.find((r) => r.userId === p.userId);
          return <VideoTile key={p.userId} stream={rs?.stream ?? null} name={p.name} screen={isSharing(p.userId)} />;
        })}

        {/* Me: my screen while I share it, else my camera */}
        <VideoTile
          stream={screenStream ?? localStream}
          name={`${currentUserName} (you)`}
          muted
          cameraOff={isCameraOff}
          screen={Boolean(screenStream)}
        />
      </div>

      <div className='p-2 border-t flex items-center justify-center gap-2'>
        <Button
          variant={isMuted ? 'destructive' : 'outline'}
          size='icon'
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <MicOff className='w-4 h-4' /> : <Mic className='w-4 h-4' />}
        </Button>
        <Button
          variant={isCameraOff ? 'destructive' : 'outline'}
          size='icon'
          onClick={onToggleCamera}
          title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}>
          {isCameraOff ? <VideoOff className='w-4 h-4' /> : <Video className='w-4 h-4' />}
        </Button>
        {onToggleScreen && (
          <Button
            variant={screenStream ? 'default' : 'outline'}
            size='icon'
            onClick={onToggleScreen}
            aria-label={screenStream ? 'Stop sharing your screen' : 'Share your screen'}
            aria-pressed={Boolean(screenStream)}
            title={screenStream ? 'Stop sharing' : 'Share screen'}>
            {screenStream ? <MonitorX className='w-4 h-4' /> : <MonitorUp className='w-4 h-4' />}
          </Button>
        )}
        <Button variant='destructive' size='icon' onClick={onLeave} title='Leave call'>
          <PhoneOff className='w-4 h-4' />
        </Button>
      </div>
    </div>
  );
}
