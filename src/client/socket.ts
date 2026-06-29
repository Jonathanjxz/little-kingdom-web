/// <reference types="vite/client" />

import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../server/socket/protocol";

const isProd = import.meta.env.PROD;
const devUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = (isProd
  ? io({ transports: ["websocket"], autoConnect: true })
  : io(devUrl, { transports: ["websocket"], autoConnect: true })) as unknown as AppSocket;

if (import.meta.env.DEV) {
  const testWindow = window as typeof window & {
    __closeKingdomSocketTransport?: () => void;
  };
  testWindow.__closeKingdomSocketTransport = () => {
    socket.io.engine?.close();
  };
}

// ---------------------------------------------------------------------------
// Connection-state helper for React
// ---------------------------------------------------------------------------

export type SocketConnectionState =
  | { status: "connecting" | "connected"; id?: string }
  | { status: "disconnected"; reason?: string }
  | { status: "reconnecting"; attempt: number }
  | { status: "reconnect_failed"; message: string };

export function getConnectionState(onChange: (s: SocketConnectionState) => void) {
  const onConnect = () => onChange({ status: "connected", id: socket.id });
  const onDisconnect = (reason: string) =>
    onChange({ status: "disconnected", reason });
  const onConnectError = (error: Error) =>
    onChange({ status: "reconnect_failed", message: error.message });
  const onReconnectAttempt = (attempt: number) =>
    onChange({ status: "reconnecting", attempt });
  const onReconnect = () => onChange({ status: "connected", id: socket.id });

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onConnectError);
  socket.io.on("reconnect_attempt", onReconnectAttempt);
  socket.io.on("reconnect", onReconnect);

  onChange(getCurrentState());

  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("connect_error", onConnectError);
    socket.io.off("reconnect_attempt", onReconnectAttempt);
    socket.io.off("reconnect", onReconnect);
  };
}

function getCurrentState(): SocketConnectionState {
  if (!socket.connected) {
    return {
      status: socket.active ? "connecting" : "disconnected",
      reason: socket.active ? undefined : "尚未连接到服务器",
    };
  }
  return { status: "connected", id: socket.id };
}
