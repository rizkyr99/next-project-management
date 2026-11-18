'use client';

import SimplePeer from 'simple-peer';
import { useEffect, useRef } from 'react';

export interface Participant {
  userId: string;
  name: string;
  image: string | null;
}

interface UseCallStreamOptions {
  projectId: string;
  /** In the call: heartbeat and signaling. Otherwise just who is in it. */
  inCall: boolean;
  onParticipants: (participants: Participant[]) => void;
  onSignal: (fromUserId: string, signalData: SimplePeer.SignalData) => void;
  /** No longer a member of this workspace. */
  onRemoved: () => void;
}

export function useCallStream({ projectId, inCall, onParticipants, onSignal, onRemoved }: UseCallStreamOptions) {
  // Latest handlers without reopening the stream each time they change.
  const handlers = useRef({ onParticipants, onSignal, onRemoved });
  useEffect(() => {
    handlers.current = { onParticipants, onSignal, onRemoved };
  });

  useEffect(() => {
    const es = new EventSource(`/api/call/stream?projectId=${projectId}${inCall ? '&inCall=1' : ''}`);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'participants') {
          handlers.current.onParticipants(msg.data);
        } else if (msg.type === 'signal') {
          const { fromUserId, payload } = msg.data;
          const signalData = typeof payload === 'string' ? JSON.parse(payload) : payload;
          handlers.current.onSignal(fromUserId, signalData);
        } else if (msg.type === 'removed') {
          es.close();
          handlers.current.onRemoved();
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => es.close();
  }, [projectId, inCall]);
}
