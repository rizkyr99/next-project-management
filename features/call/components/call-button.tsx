'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';
import SimplePeer from 'simple-peer';
import { useCallback, useRef, useState } from 'react';
import { CallRoom } from './call-room';
import { useCallStream } from '../hooks/use-call-stream';
import { useWebRTC } from '../hooks/use-webrtc';

interface Participant {
  userId: string;
  name: string;
  image: string | null;
}

interface CallButtonProps {
  projectId: string;
  currentUserId: string;
  currentUserName: string;
}

export function CallButton({ projectId, currentUserId, currentUserName }: CallButtonProps) {
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [idleParticipants, setIdleParticipants] = useState<Participant[]>([]);
  const previousParticipantIds = useRef<Set<string>>(new Set());

  const { localStream, remoteStreams, isMuted, isCameraOff, start, stop, connectToParticipants, handleIncomingSignal, toggleMute, toggleCamera } =
    useWebRTC({ projectId, userId: currentUserId });

  const handleParticipants = useCallback(
    (list: Participant[]) => {
      if (inCall) {
        setParticipants(list);
        const ids = list.map((p) => p.userId).filter((id) => id !== currentUserId);
        const prevIds = previousParticipantIds.current;
        const newIds = ids.filter((id) => !prevIds.has(id));
        previousParticipantIds.current = new Set(ids);
        if (newIds.length > 0) {
          connectToParticipants(ids);
        }
      } else {
        setIdleParticipants(list.filter((p) => p.userId !== currentUserId));
      }
    },
    [inCall, currentUserId, connectToParticipants],
  );

  const handleSignal = useCallback(
    (fromUserId: string, signalData: SimplePeer.SignalData) => {
      handleIncomingSignal(fromUserId, signalData);
    },
    [handleIncomingSignal],
  );

  useCallStream({
    projectId,
    active: true,
    onParticipants: handleParticipants,
    onSignal: handleSignal,
  });

  const joinCall = async () => {
    await fetch('/api/call/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });

    const stream = await start();
    setInCall(true);
    previousParticipantIds.current = new Set();

    // Connect to whoever is already in the room
    const currentIds = participants.map((p) => p.userId).filter((id) => id !== currentUserId);
    if (currentIds.length > 0 && stream) {
      connectToParticipants(currentIds);
    }
  };

  const leaveCall = async () => {
    stop();
    setInCall(false);
    setParticipants([]);
    previousParticipantIds.current = new Set();
    await fetch('/api/call/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
  };

  return (
    <>
      <div className='flex items-center gap-2'>
        {/* Avatars of people already in the call */}
        {!inCall && idleParticipants.length > 0 && (
          <div className='flex -space-x-2'>
            {idleParticipants.slice(0, 3).map((p) => (
              <Avatar key={p.userId} className='w-6 h-6 border-2 border-background'>
                <AvatarImage src={p.image ?? undefined} />
                <AvatarFallback className='text-xs'>{p.name.charAt(0)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}

        {inCall ? (
          <Button variant='destructive' size='sm' onClick={leaveCall} className='gap-1.5'>
            <PhoneOff className='w-3.5 h-3.5' />
            Leave
          </Button>
        ) : (
          <Button variant='outline' size='sm' onClick={joinCall} className='gap-1.5'>
            <Phone className='w-3.5 h-3.5' />
            {idleParticipants.length > 0 ? `Join call (${idleParticipants.length})` : 'Start call'}
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
          onLeave={leaveCall}
        />
      )}
    </>
  );
}
