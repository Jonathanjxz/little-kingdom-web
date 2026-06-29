/**
 * 房间管理类型定义
 *
 * 定义房间、成员等内存管理所需的核心类型。
 */

import type { GameState, PlayerId, RoomId } from "../../game/types";

export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomMember {
  playerId: PlayerId;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;
  /** 不可预测的会话令牌，用于验证 socket 身份 */
  sessionToken: string;
}

export interface Room {
  roomId: RoomId;
  status: RoomStatus;
  hostPlayerId: PlayerId;
  members: RoomMember[];
  gameState?: GameState;
  createdAt: number;
  updatedAt: number;
}