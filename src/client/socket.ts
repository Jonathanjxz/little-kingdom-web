/// <reference types="vite/client" />

import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../server/socket/protocol";

const isProd = import.meta.env.PROD;
const devUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = (isProd
  ? io({ transports: ["websocket"], autoConnect: true })
  : io(devUrl, { transports: ["websocket"], autoConnect: true })) as unknown as AppSocket;

// ---------------------------------------------------------------------------
// Connection-state helper for React
// ---------------------------------------------------------------------------

export type SocketConnectionState =
  | { status: "connecting" | "connected"; id?: string }
  | { status: "disconnected"; reason?: string }
  | { status: "error"; message: string };

export function getConnectionState(onChange: (s: SocketConnectionState) => void) {
  const emit = () => onChange(getCurrentState());

  socket.on("connect", emit);
  socket.on("disconnect", emit);
  socket.on("connect_error", emit);

  emit();

  return () => {
    socket.off("connect", emit);
    socket.off("disconnect", emit);
    socket.off("connect_error", emit);
  };
}

function getCurrentState(): SocketConnectionState {
  if (!socket.connected) {
    return {
      status: "disconnected",
      reason: socket.disconnected
        ? "尚未连接到服务器，请确认 npm.cmd run server 已启动"
        : undefined,
    };
  }
  return { status: "connected", id: socket.id };
}