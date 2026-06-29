/**
 * 广播器
 *
 * 封装向客户端发送消息的逻辑。
 * - emitRoomUpdated: 广播公开房间信息
 * - emitGameViews: 向每名玩家分别发送其私有游戏视角
 */

import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./protocol";
import { toPublicRoomView } from "./protocol";
import type { RoomService } from "../rooms/room-service";
import type { Room } from "../rooms/room-types";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * 向房间全体广播公开房间信息。
 * 仅暴露 `PublicRoomView`，不返回完整 Room。
 */
export function emitRoomUpdated(io: AppServer, room: Room): void {
  io.to(room.roomId).emit("room:updated", {
    room: toPublicRoomView(room),
  });
}

/**
 * 向房间内每名玩家单独发送其私有游戏视角。
 * - 如果房间无 gameState，直接返回。
 * - 为每名 member 调用 `roomService.getPlayerView`。
 * - 发送到 socket room `${roomId}:${playerId}`。
 */
export function emitGameViews(
  io: AppServer,
  roomService: RoomService,
  room: Room,
): void {
  if (!room.gameState) return;

  for (const member of room.members) {
    try {
      const view = roomService.getPlayerView(room.roomId, member.playerId);
      io.to(`${room.roomId}:${member.playerId}`).emit("game:view", { view });
    } catch {
      // 如果某个玩家获取视角失败（理论上不应发生），跳过
    }
  }
}