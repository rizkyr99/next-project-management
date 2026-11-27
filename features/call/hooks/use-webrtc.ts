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

/** Sent over each peer's data channel: whether this person is sharing their screen (I12). */
type PeerMessage = { type: 'screen'; sharing: boolean };

function parseMessage(data: unknown): PeerMessage | null {
  try {
    const value = JSON.parse(String(data)) as Partial<PeerMessage>;
    return value?.type === 'screen' && typeof value.sharing === 'boolean' ? (value as PeerMessage) : null;
  } catch {
    return null;
  }
}

/** Whether this browser can share a screen (desktop browsers; not phones). */
export const canShareScreen = () =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export function useWebRTC({ projectId, userId }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  // I12: my screen while I share it, and who else is sharing theirs.
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingUserIds, setSharingUserIds] = useState<string[]>([]);
  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  // Bumped when the call stops, so a screen picked after leaving is dropped.
  const callGenerationRef = useRef(0);
  const iceServersRef = useRef<RTCIceServer[] | undefined>(undefined);

  const setSharing = useCallback((remoteUserId: string, sharing: boolean) => {
    setSharingUserIds((prev) => {
      const without = prev.filter((id) => id !== remoteUserId);
      return sharing ? [...without, remoteUserId] : without;
    });
  }, []);

  const tell = (peer: SimplePeer.Instance, message: PeerMessage) => {
    // Not connected yet: the 'connect' handler sends the current state.
    if (peer.connected) peer.send(JSON.stringify(message));
  };

  /**
   * Swap the video every peer receives (camera ↔ screen) on the live
   * connection: no renegotiation. simple-peer tracks the sender by the
   * track it was given, so swapping back works the same way.
   */
  const swapVideo = (peer: SimplePeer.Instance, from: MediaStreamTrack, to: MediaStreamTrack) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      peer.replaceTrack(from, to, stream);
    } catch (error) {
      console.error('[call] replaceTrack failed:', error);
    }
  };

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

      const peer = new SimplePeer({
        initiator,
        stream,
        trickle: true,
        // Without these, simple-peer's defaults apply (public STUN only).
        config: iceServersRef.current ? { iceServers: iceServersRef.current } : undefined,
      });

      peer.on('signal', (data) => {
        const type = data.type === 'offer' ? 'offer' : data.type === 'answer' ? 'answer' : 'ice-candidate';
        sendSignal(remoteUserId, type, data);
      });

      peer.on('connect', () => {
        if (screenTrackRef.current) tell(peer, { type: 'screen', sharing: true });
      });

      peer.on('data', (data) => {
        const message = parseMessage(data);
        if (message) setSharing(remoteUserId, message.sharing);
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
        setSharing(remoteUserId, false);
      });

      peer.on('error', () => {
        peersRef.current.delete(remoteUserId);
        setRemoteStreams((prev) => prev.filter((r) => r.userId !== remoteUserId));
        setSharing(remoteUserId, false);
      });

      peersRef.current.set(remoteUserId, peer);
      // Joined while I'm sharing: they get my screen, not my camera.
      const camera = stream.getVideoTracks()[0];
      if (screenTrackRef.current && camera) swapVideo(peer, camera, screenTrackRef.current);
      return peer;
    },
    [sendSignal, setSharing],
  );

  const start = useCallback(async () => {
    const [stream, iceServers] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
      fetchIceServers(projectId),
    ]);
    iceServersRef.current = iceServers;
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [projectId]);

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

  const stopScreenShare = useCallback(() => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    const camera = localStreamRef.current?.getVideoTracks()[0];
    for (const peer of peersRef.current.values()) {
      if (camera) swapVideo(peer, screen, camera);
      tell(peer, { type: 'screen', sharing: false });
    }
    screen.stop();
    setScreenStream(null);
  }, []);

  /** Share a screen, window or tab instead of the camera. Throws if the person cancels. */
  const startScreenShare = useCallback(async () => {
    const camera = localStreamRef.current?.getVideoTracks()[0];
    if (!camera || screenTrackRef.current) return;
    const generation = callGenerationRef.current;
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screen = display.getVideoTracks()[0];
    // The picker stays open while the call goes on: if the call ended (or
    // another share started) meanwhile, don't leave this capture running.
    const stale =
      generation !== callGenerationRef.current ||
      localStreamRef.current?.getVideoTracks()[0] !== camera ||
      screenTrackRef.current !== null;
    if (!screen || stale) {
      display.getTracks().forEach((t) => t.stop());
      return;
    }
    screenTrackRef.current = screen;
    // The browser's own "Stop sharing" button ends the track.
    screen.addEventListener('ended', stopScreenShare);
    for (const peer of peersRef.current.values()) {
      swapVideo(peer, camera, screen);
      tell(peer, { type: 'screen', sharing: true });
    }
    setScreenStream(display);
  }, [stopScreenShare]);

  const stop = useCallback(() => {
    callGenerationRef.current += 1;
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    setScreenStream(null);
    setSharingUserIds([]);
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
    screenStream,
    sharingUserIds,
    startScreenShare,
    stopScreenShare,
  };
}

/** STUN, plus TURN when the server has it configured. Never blocks a call. */
async function fetchIceServers(projectId: string): Promise<RTCIceServer[] | undefined> {
  try {
    const res = await fetch(`/api/call/ice?projectId=${projectId}`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const { iceServers } = (await res.json()) as { iceServers?: RTCIceServer[] };
    return iceServers?.length ? iceServers : undefined;
  } catch {
    return undefined;
  }
}
