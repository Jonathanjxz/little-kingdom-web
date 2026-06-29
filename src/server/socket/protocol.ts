/**
 * Socket.IO 协议定义
 *
 * 客户端 ↔ 服务端事件类型及 payload 格式。
 */

import type {
  GameAction,
  PlayerId,
  RoomId,
} from "../../game/types";
import type { PlayerGameView } from "../../game/view";
import type { PublicTimerView, Room, RoomMember } from "../rooms/room-types";
import type {
  TimeControlConfig,
  TimeControlMode,
} from "../timer/time-control";

// ---------------------------------------------------------------------------
// PublicRoomView（对外安全暴露 — 不含 sessionToken）
// ---------------------------------------------------------------------------

export interface PublicRoomMember {
  playerId: PlayerId;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
}

export interface PublicRoomView {
  roomId: RoomId;
  status: Room["status"];
  hostPlayerId: PlayerId;
  members: PublicRoomMember[];
  timeControl: TimeControlConfig;
}

export function toPublicRoomView(room: Room): PublicRoomView {
  return {
    roomId: room.roomId,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    timeControl: room.timeControl,
    members: room.members.map((m: RoomMember) => ({
      playerId: m.playerId,
      nickname: m.nickname,
      isHost: m.isHost,
      isConnected: m.isConnected,
    })),
  };
}

// ---------------------------------------------------------------------------
// Payload 类型
// ---------------------------------------------------------------------------

export interface CreateRoomPayload {
  room: PublicRoomView;
  playerId: PlayerId;
  sessionToken: string;
}

export interface JoinRoomPayload {
  room: PublicRoomView;
  playerId: PlayerId;
  sessionToken: string;
}

export interface ReconnectPayload {
  room: PublicRoomView;
  playerId: PlayerId;
  view?: PlayerGameView;
  timer?: PublicTimerView;
  sessionToken: string;
}

export interface RoomPayload {
  room: PublicRoomView;
}

export interface GameViewPayload {
  view: PlayerGameView;
  timer: PublicTimerView;
}

export interface RoomDeletedPayload {
  roomDeleted: true;
}

// ---------------------------------------------------------------------------
// SocketAck
// ---------------------------------------------------------------------------

export interface SocketErrorPayload {
  code: string;
  message: string;
}

export interface SocketAck<T = undefined> {
  ok: boolean;
  data?: T;
  error?: SocketErrorPayload;
}

// ---------------------------------------------------------------------------
// Socket 数据（服务端）
// ---------------------------------------------------------------------------

export interface SocketData {
  roomId?: RoomId;
  playerId?: PlayerId;
  sessionToken?: string;
}

// ---------------------------------------------------------------------------
// 事件类型
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  "room:create": (
    input: { nickname: string; timeControlMode?: TimeControlMode },
    ack: (result: SocketAck<CreateRoomPayload>) => void,
  ) => void;

  "room:join": (
    input: { roomId: RoomId; nickname: string },
    ack: (result: SocketAck<JoinRoomPayload>) => void,
  ) => void;

  "room:leave": (
    input: {},
    ack: (result: SocketAck<RoomPayload | RoomDeletedPayload>) => void,
  ) => void;

  "room:reconnect": (
    input: { roomId: RoomId; playerId: PlayerId; sessionToken: string },
    ack: (result: SocketAck<ReconnectPayload>) => void,
  ) => void;

  "game:start": (
    input: {},
    ack: (result: SocketAck<RoomPayload>) => void,
  ) => void;

  "game:action": (
    input: { action: GameAction },
    ack: (result: SocketAck<GameViewPayload>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "room:updated": (payload: RoomPayload) => void;
  "game:view": (payload: GameViewPayload) => void;
}
