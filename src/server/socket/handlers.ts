/**
 * Socket.IO 事件处理器
 *
 * 注册客户端事件监听，将请求转发给 RoomService，
 * 并按协议返回 ack 和广播给其他客户端。
 *
 * 安全设计：
 * - 创建/加入/重连后绑定 socket.data
 * - 敏感操作从 socket.data 读取身份，不信任客户端 payload
 * - disconnect 事件调用 roomService.disconnect（不移除成员）
 * - game:action 中覆盖 action.playerId 防止伪造
 */

import type { Server, Socket } from "socket.io";
import { RuleError } from "../../game/errors";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
  SocketData,
  SocketErrorPayload,
} from "./protocol";
import { toPublicRoomView } from "./protocol";
import { RoomError } from "../rooms/room-service";
import type { RoomService } from "../rooms/room-service";
import { emitGameViews, emitRoomUpdated } from "./broadcaster";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

function toSocketError(error: unknown): SocketErrorPayload {
  if (error instanceof RoomError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof RuleError) {
    return { code: error.code, message: error.message };
  }
  return { code: "UNKNOWN_ERROR", message: "UNKNOWN_ERROR" };
}

function successAck<T>(data: T, ack: (result: SocketAck<T>) => void): void {
  ack({ ok: true, data });
}

function errorAck(error: unknown, ack: (result: SocketAck<never>) => void): void {
  ack({ ok: false, error: toSocketError(error) });
}

function requireAuth(socket: AppSocket): Required<SocketData> {
  if (!socket.data.roomId || !socket.data.playerId || !socket.data.sessionToken) {
    throw new RoomError("INVALID_SESSION");
  }
  return socket.data as Required<SocketData>;
}

function joinSocketRooms(socket: AppSocket, roomId: string, playerId: string): void {
  socket.join(roomId);
  socket.join(`${roomId}:${playerId}`);
}

function leaveSocketRooms(socket: AppSocket, roomId: string, playerId: string): void {
  socket.leave(roomId);
  socket.leave(`${roomId}:${playerId}`);
}

// ---------------------------------------------------------------------------
// registerSocketHandlers
// ---------------------------------------------------------------------------

export function registerSocketHandlers(
  io: AppServer,
  roomService: RoomService,
): void {
  roomService.setRoomUpdateListener((room) => {
    emitGameViews(io, roomService, room);
    if (room.status === "finished") {
      emitRoomUpdated(io, room);
    }
  });

  io.on("connection", (socket) => {
    // ---------------------------------------------------------------
    // room:create
    // ---------------------------------------------------------------
    socket.on("room:create", (input, ack) => {
      try {
        const { room, playerId, sessionToken } = roomService.createRoom({
          nickname: input.nickname,
          timeControlMode: input.timeControlMode,
        });
        socket.data = { roomId: room.roomId, playerId, sessionToken };
        joinSocketRooms(socket, room.roomId, playerId);
        successAck({ room: toPublicRoomView(room), playerId, sessionToken }, ack);
        emitRoomUpdated(io, room);
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // room:join
    // ---------------------------------------------------------------
    socket.on("room:join", (input, ack) => {
      try {
        const { room, playerId, sessionToken } = roomService.joinRoom({
          roomId: input.roomId,
          nickname: input.nickname,
        });
        socket.data = { roomId: room.roomId, playerId, sessionToken };
        joinSocketRooms(socket, room.roomId, playerId);
        successAck({ room: toPublicRoomView(room), playerId, sessionToken }, ack);
        emitRoomUpdated(io, room);
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // room:leave（主动离开 — 使用 socket.data）
    // ---------------------------------------------------------------
    socket.on("room:leave", (_input, ack) => {
      try {
        const { roomId, playerId } = requireAuth(socket);
        const room = roomService.leaveRoom(roomId, playerId);
        leaveSocketRooms(socket, roomId, playerId);
        socket.data = {};

        const currentRoom = roomService.getRoom(roomId);
        if (!currentRoom) {
          ack({ ok: true, data: { roomDeleted: true as const } });
          return;
        }
        successAck({ room: toPublicRoomView(room) }, ack);
        emitRoomUpdated(io, room);
        emitGameViews(io, roomService, room);
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // room:reconnect（客户端传入 token）
    // ---------------------------------------------------------------
    socket.on("room:reconnect", (input, ack) => {
      try {
        const room = roomService.reconnect({
          roomId: input.roomId,
          playerId: input.playerId,
          sessionToken: input.sessionToken,
        });
        socket.data = {
          roomId: input.roomId,
          playerId: input.playerId,
          sessionToken: input.sessionToken,
        };
        joinSocketRooms(socket, input.roomId, input.playerId);

        let view = undefined;
        let timer = undefined;
        if (room.gameState) {
          try {
            view = roomService.getPlayerView(input.roomId, input.playerId);
            timer = roomService.getTimerView(input.roomId);
          } catch { /* optional */ }
        }

        successAck({
          room: toPublicRoomView(room),
          playerId: input.playerId,
          sessionToken: input.sessionToken,
          view,
          timer,
        }, ack);
        emitRoomUpdated(io, room);
        emitGameViews(io, roomService, room);
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // game:start（使用 socket.data.playerId，不信任 payload）
    // ---------------------------------------------------------------
    socket.on("game:start", (_input, ack) => {
      try {
        const { roomId, playerId } = requireAuth(socket);
        const room = roomService.startGame(roomId, playerId);
        successAck({ room: toPublicRoomView(room) }, ack);
        emitRoomUpdated(io, room);
        emitGameViews(io, roomService, room);
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // game:action（覆盖 action.playerId 防止伪造）
    // ---------------------------------------------------------------
    socket.on("game:action", (input, ack) => {
      try {
        const { roomId, playerId } = requireAuth(socket);

        const safeAction = {
          ...input.action,
          playerId,
        } as typeof input.action;

        const view = roomService.applyGameActionToRoom(roomId, playerId, safeAction);
        const timer = roomService.getTimerView(roomId);
        const room = roomService.getRoom(roomId)!;

        successAck({ view, timer }, ack);
        emitGameViews(io, roomService, room);
        if (room.status === "finished") {
          emitRoomUpdated(io, room);
        }
      } catch (err) {
        errorAck(err, ack);
      }
    });

    // ---------------------------------------------------------------
    // disconnect（断线 — 不移除成员，只标记离线）
    // ---------------------------------------------------------------
    socket.on("disconnect", () => {
      const data = socket.data;
      if (data.roomId && data.playerId) {
        try {
          const room = roomService.disconnect(data.roomId, data.playerId);
          emitRoomUpdated(io, room);
          emitGameViews(io, roomService, room);
        } catch { /* 断线处理容错 */ }
      }
    });
  });
}
