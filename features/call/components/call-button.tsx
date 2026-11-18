'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';
import SimplePeer from 'simple-peer';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CallRoom } from './call-room';
import { useCallStream, type Participant } from '../hooks/use-call-stream';
import { useWebRTC } from '../hooks/use-webrtc';

interface CallButtonProps {
  projectId: string;
  currentUserId: string;
  currentUserName: string;
}

type JoinResult = { ok: true } | { ok: false; error: string };

export function CallButton({ projectId, currentUserId, currentUserName }: CallButtonProps) {
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const rejoining = useRef(false);

  const { localStream, remoteStreams, isMuted, isCameraOff, start, stop, connectToParticipants, handleIncomingSignal, toggleMute, toggleCamera } =
    useWebRTC({ projectId, userId: currentUserId });

  const post = useCallback(
    async (path: 'join' | 'leave'): Promise<JoinResult> => {
      try {
        const res = await fetch(`/api/call/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        if (res.ok) return { ok: true };
        const body = await res.json().catch(() => null);
        return { ok: false, error: body?.error ?? 'Could not join the call. Try again.' };
      } catch {
        return { ok: false, error: 'Could not reach the server. Check your connection.' };
      }
    },
    [projectId],
  );

  const endCall = useCallback(
    (message?: string) => {
      stop();
      setInCall(false);
      void post('leave');
      if (message) toast.error(message);
    },
    [stop, post],
  );

  const handleParticipants = useCallback(
    (list: Participant[]) => {
      setParticipants(list);
      if (!inCall) return;

      if (!list.some((p) => p.userId === currentUserId)) {
        // Our place timed out (e.g. a long network stall). Take it back if
        // there's still room.
        if (rejoining.current) return;
        rejoining.current = true;
        void post('join').then((r) => {
          rejoining.current = false;
          if (!r.ok) endCall('You were disconnected, and the call is now full.');
        });
        return;
      }
      connectToParticipants(list.map((p) => p.userId));
    },
    [inCall, currentUserId, connectToParticipants, post, endCall],
  );

  const handleSignal = useCallback(
    (fromUserId: string, signalData: SimplePeer.SignalData) => handleIncomingSignal(fromUserId, signalData),
    [handleIncomingSignal],
  );

  useCallStream({
    projectId,
    inCall,
    onParticipants: handleParticipants,
    onSignal: handleSignal,
    onRemoved: () => endCall('You no longer have access to this project.'),
  });

  const joinCall = async () => {
    setJoining(true);
    try {
      const joined = await post('join');
      if (!joined.ok) {
        toast.error(joined.error);
        return;
      }
      try {
        await start();
      } catch {
        void post('leave');
        toast.error('Allow camera and microphone access to join the call.');
        return;
      }
      setInCall(true);
    } finally {
      setJoining(false);
    }
  };

  const others = participants.filter((p) => p.userId !== currentUserId);

  return (
    <>
      <div className='flex items-center gap-2'>
        {/* Avatars of people already in the call */}
        {!inCall && others.length > 0 && (
          <div className='flex -space-x-2'>
            {others.slice(0, 3).map((p) => (
              <Avatar key={p.userId} className='w-6 h-6 border-2 border-background'>
                <AvatarImage src={p.image ?? undefined} />
                <AvatarFallback className='text-xs'>{p.name.charAt(0)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}

        {inCall ? (
          <Button variant='destructive' size='sm' onClick={() => endCall()} className='gap-1.5'>
            <PhoneOff className='w-3.5 h-3.5' />
            Leave
          </Button>
        ) : (
          <Button variant='outline' size='sm' onClick={joinCall} disabled={joining} className='gap-1.5'>
            <Phone className='w-3.5 h-3.5' />
            {/* Icon-only on phones; the label stays for screen readers. */}
            <span className='sr-only sm:not-sr-only'>
              {others.length > 0 ? `Join call (${others.length})` : 'Start call'}
              <span className='sr-only'> (beta)</span>
            </span>
          </Button>
        )}
      </div>

      {inCall && (
        <CallRoom
          localStream={localStream}
          remoteStreams={remoteStreams}
          participants={participants}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onLeave={() => endCall()}
        />
      )}
    </>
  );
}
