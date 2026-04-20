'use client';

import SimplePeer from 'simple-peer';
import { useEffect, useRef } from 'react';

interface Participant {
  userId: string;
  name: string;
  image: string | null;
}

interface UseCallStreamOptions {
  projectId: string;
  active: boolean;
  onParticipants: (participants: Participant[]) => void;
  onSignal: (fromUserId: string, signalData: SimplePeer.SignalData) => void;
}

export function useCallStream({ projectId, active, onParticipants, onSignal }: UseCallStreamOptions) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!active) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    const es = new EventSource(`/api/call/stream?projectId=${projectId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'participants') {
          onParticipants(msg.data);
        } else if (msg.type === 'signal') {
          const { fromUserId, payload } = msg.data;
          const signalData = typeof payload === 'string' ? JSON.parse(payload) : payload;
          onSignal(fromUserId, signalData);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [projectId, active, onParticipants, onSignal]);
}
