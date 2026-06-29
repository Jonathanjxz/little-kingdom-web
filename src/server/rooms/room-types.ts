/**
 * 房间管理类型定义
 *
 * 定义房间、成员等内存管理所需的核心类型。
 */

import type { GamePhase, GameState, PlayerId, RoomId } from "../../game/types";
import type { TimeControlConfig } from "../timer/time-control";

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

export interface RoomTimerState {
  playerId: PlayerId;
  phase: GamePhase;
  startedAt: number;
  deadlineAt: number;
}

export interface PublicTimerView {
  mode: TimeControlConfig["mode"];
  playerId?: PlayerId;
  phase?: GamePhase;
  startedAt?: number;
  deadlineAt?: number;
  serverNow: number;
  baseSeconds?: number;
  extraRemainingSeconds?: number;
}

export interface Room {
  roomId: RoomId;
  status: RoomStatus;
  hostPlayerId: PlayerId;
  members: RoomMember[];
  timeControl: TimeControlConfig;
  timerState?: RoomTimerState;
  gameState?: GameState;
  createdAt: number;
  updatedAt: number;
}
