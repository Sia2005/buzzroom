import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { syncClock } from '../lib/clock.js';
import { clearSession, loadSession } from '../lib/session.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;
const REQUEST_TIMEOUT_MS = 8000;
const FATAL_REJOIN_CODES = new Set(['ROOM_NOT_FOUND', 'UNAUTHORIZED', 'NOT_ALLOWED']);

let sharedSocket = null;

function getSocket() {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io(SERVER_URL, {
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  sharedSocket.on('connect', () => syncClock(sharedSocket));
  return sharedSocket;
}

export async function request(event, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    return await getSocket().timeout(timeoutMs).emitWithAck(event, payload);
  } catch {
    return {
      ok: false,
      error: { code: 'TIMEOUT', message: 'The server did not respond. Check your connection.' },
    };
  }
}

export function useSocket({ role, code, onSnapshot } = {}) {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);
  const [hasConnected, setHasConnected] = useState(socket.connected);
  const [rejoinError, setRejoinError] = useState(null);
  const [restoring, setRestoring] = useState(Boolean(role && code));
  const snapshotHandler = useRef(onSnapshot);

  useEffect(() => {
    snapshotHandler.current = onSnapshot;
  });

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!role || !code) return;
      const session = loadSession(role);
      if (!session || session.code !== code) {
        setRejoinError({ code: 'NO_SESSION', message: 'You are not part of this room.' });
        setRestoring(false);
        return;
      }

      const event = role === 'host' ? 'host:rejoin' : 'player:rejoin';
      const { code: roomCode, hostToken, playerToken } = session;
      const payload =
        role === 'host' ? { code: roomCode, hostToken } : { code: roomCode, playerToken };
      const response = await request(event, payload);
      if (cancelled) return;
      setRestoring(false);

      if (response.ok) {
        setRejoinError(null);
        snapshotHandler.current?.(response.snapshot);
        return;
      }
      if (FATAL_REJOIN_CODES.has(response.error?.code)) clearSession(role);
      setRejoinError(response.error);
    }

    const handleConnect = () => {
      setConnected(true);
      setHasConnected(true);
      restore();
    };
    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);
    if (socket.connected) queueMicrotask(handleConnect);

    return () => {
      cancelled = true;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleDisconnect);
    };
  }, [socket, role, code]);

  const status = connected ? 'connected' : hasConnected ? 'reconnecting' : 'connecting';
  return { status, rejoinError, restoring };
}

export function useSocketEvent(event, handler) {
  const socket = getSocket();
  const latestHandler = useRef(handler);

  useEffect(() => {
    latestHandler.current = handler;
  });

  useEffect(() => {
    const listener = (payload) => latestHandler.current(payload);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
