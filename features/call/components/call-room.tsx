'use client';

import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { VideoTile } from './video-tile';
import { RemoteStream } from '../hooks/use-webrtc';

interface Participant {
  userId: string;
  name: string;
  image: string | null;
}

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
}: CallRoomProps) {
  const remoteParticipants = participants.filter((p) => p.userId !== currentUserId);

  return (
    <div className='fixed bottom-4 right-4 z-50 w-80 bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col'>
      <div className='p-2 border-b flex items-center justify-between'>
        <span className='text-sm font-medium'>Call · {participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
      </div>

      <div className='p-2 flex flex-col gap-2 max-h-96 overflow-y-auto'>
        {/* Local video */}
        <VideoTile
          stream={localStream}
          name={`${currentUserName} (you)`}
          muted
          cameraOff={isCameraOff}
        />

        {/* Remote videos */}
        {remoteParticipants.map((p) => {
          const rs = remoteStreams.find((r) => r.userId === p.userId);
          return (
            <VideoTile
              key={p.userId}
              stream={rs?.stream ?? null}
              name={p.name}
            />
          );
        })}
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
        <Button variant='destructive' size='icon' onClick={onLeave} title='Leave call'>
          <PhoneOff className='w-4 h-4' />
        </Button>
      </div>
    </div>
  );
}
