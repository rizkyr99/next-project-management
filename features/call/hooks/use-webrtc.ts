'use client';

import SimplePeer from 'simple-peer';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWebRTCOptions {
  projectId: string;
  userId: string;
}

export interface RemoteStream {
  userId: string;
  stream: MediaStream;
}

export function useWebRTC({ projectId, userId }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const sendSignal = useCallback(
    async (toUserId: string, type: string, payload: unknown) => {
      await fetch('/api/call/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, toUserId, type, payload }),
      });
    },
    [projectId],
  );

  const createPeer = useCallback(
    (remoteUserId: string, initiator: boolean, stream: MediaStream) => {
      if (peersRef.current.has(remoteUserId)) return peersRef.current.get(remoteUserId)!;

      const peer = new SimplePeer({ initiator, stream, trickle: true });

      peer.on('signal', (data) => {
        const type = data.type === 'offer' ? 'offer' : data.type === 'answer' ? 'answer' : 'ice-candidate';
        sendSignal(remoteUserId, type, data);
      });

      peer.on('stream', (remoteStream) => {
        setRemoteStreams((prev) => {
          const filtered = prev.filter((r) => r.userId !== remoteUserId);
          return [...filtered, { userId: remoteUserId, stream: remoteStream }];
        });
      });

      peer.on('close', () => {
        peersRef.current.delete(remoteUserId);
        setRemoteStreams((prev) => prev.filter((r) => r.userId !== remoteUserId));
      });

      peer.on('error', () => {
        peersRef.current.delete(remoteUserId);
        setRemoteStreams((prev) => prev.filter((r) => r.userId !== remoteUserId));
      });

      peersRef.current.set(remoteUserId, peer);
      return peer;
    },
    [sendSignal],
  );

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const connectToParticipants = useCallback(
    (participantIds: string[]) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      for (const pid of participantIds) {
        if (pid === userId || peersRef.current.has(pid)) continue;
        // Current user with higher userId initiates to avoid double-offers
        createPeer(pid, userId > pid, stream);
      }

      // Clean up peers that are no longer in the room
      for (const [pid, peer] of peersRef.current) {
        if (!participantIds.includes(pid)) {
          peer.destroy();
          peersRef.current.delete(pid);
          setRemoteStreams((prev) => prev.filter((r) => r.userId !== pid));
        }
      }
    },
    [userId, createPeer],
  );

  const handleIncomingSignal = useCallback(
    (fromUserId: string, signalData: SimplePeer.SignalData) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      let peer = peersRef.current.get(fromUserId);
      if (!peer) {
        peer = createPeer(fromUserId, false, stream);
      }
      peer.signal(signalData);
    },
    [createPeer],
  );

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsCameraOff((prev) => !prev);
  }, []);

  const stop = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    for (const peer of peersRef.current.values()) peer.destroy();
    peersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    localStream,
    remoteStreams,
    isMuted,
    isCameraOff,
    start,
    stop,
    connectToParticipants,
    handleIncomingSignal,
    toggleMute,
    toggleCamera,
  };
}
