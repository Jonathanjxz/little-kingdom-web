/**
 * 房间服务（内存版）
 *
 * 负责房间生命周期管理：
 * - 创建房间
 * - 加入 / 退出 / 重连 / 断线
 * - 房主转移
 * - 开始游戏
 * - 玩家视角 DTO
 * - 会话令牌验证
 *
 * ID 生成使用自增序列，sessionToken 使用 crypto.randomUUID()。
 */

import { randomUUID } from "node:crypto";
import { applyGameAction } from "../../game/actions";
import { createInitialGameState } from "../../game/state";
import { createPlayerGameView } from "../../game/view";
import type { PlayerGameView } from "../../game/view";
import type { GameAction, PlayerId, RoomId } from "../../game/types";
import type { Room, RoomMember } from "./room-types";
import { InMemoryRoomRepository } from "./room-repository";

// ---------------------------------------------------------------------------
// RoomError
// ---------------------------------------------------------------------------

export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_NOT_WAITING"
  | "ROOM_FULL"
  | "PLAYER_NOT_FOUND"
  | "NOT_HOST"
  | "INVALID_ROOM_PLAYER_COUNT"
  | "GAME_NOT_STARTED"
  | "PLAYER_ID_MISMATCH"
  | "INVALID_SESSION";

export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode, message = code) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 输入/输出类型
// ---------------------------------------------------------------------------

export interface CreateRoomInput {
  nickname: string;
  now?: number;
}

export interface CreateRoomOutput {
  room: Room;
  playerId: PlayerId;
  sessionToken: string;
}

export interface JoinRoomInput {
  roomId: RoomId;
  nickname: string;
  now?: number;
}

export interface JoinRoomOutput {
  room: Room;
  playerId: PlayerId;
  sessionToken: string;
}

export interface ReconnectInput {
  roomId: RoomId;
  playerId: PlayerId;
  sessionToken: string;
}

// ---------------------------------------------------------------------------
// RoomService
// ---------------------------------------------------------------------------

export class RoomService {
  private nextRoomSeq = 1;
  private nextPlayerSeq = 1;
  private readonly repository: InMemoryRoomRepository;

  constructor(repository?: InMemoryRoomRepository) {
    this.repository = repository ?? new InMemoryRoomRepository();
  }

  /** 生成房间 ID */
  private genRoomId(): RoomId {
    return `room-${this.nextRoomSeq++}` as RoomId;
  }

  /** 生成玩家 ID */
  private genPlayerId(): PlayerId {
    return `player-${this.nextPlayerSeq++}` as PlayerId;
  }

  /** 生成不可预测的会话令牌 */
  private genSessionToken(): string {
    return randomUUID();
  }

  /** 获取当前时间戳 */
  private now(override?: number): number {
    return override ?? 0;
  }

  // -----------------------------------------------------------------------
  // 会话验证
  // -----------------------------------------------------------------------

  /**
   * 验证会话令牌是否匹配。
   * @returns 匹配的 RoomMember
   * @throws ROOM_NOT_FOUND / PLAYER_NOT_FOUND / INVALID_SESSION
   */
  verifySession(
    roomId: RoomId,
    playerId: PlayerId,
    sessionToken: string,
  ): RoomMember {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");

    const member = room.members.find((m) => m.playerId === playerId);
    if (!member) throw new RoomError("PLAYER_NOT_FOUND");

    if (member.sessionToken !== sessionToken) {
      throw new RoomError("INVALID_SESSION");
    }

    return member;
  }

  // -----------------------------------------------------------------------
  // 创建房间
  // -----------------------------------------------------------------------

  createRoom(input: CreateRoomInput): CreateRoomOutput {
    const ts = this.now(input.now);
    const playerId = this.genPlayerId();
    const roomId = this.genRoomId();
    const sessionToken = this.genSessionToken();

    const member: RoomMember = {
      playerId,
      nickname: input.nickname,
      isHost: true,
      isConnected: true,
      joinedAt: ts,
      sessionToken,
    };

    const room: Room = {
      roomId,
      status: "waiting",
      hostPlayerId: playerId,
      members: [member],
      gameState: undefined,
      createdAt: ts,
      updatedAt: ts,
    };

    this.repository.create(room);
    return { room, playerId, sessionToken };
  }

  // -----------------------------------------------------------------------
  // 加入房间
  // -----------------------------------------------------------------------

  joinRoom(input: JoinRoomInput): JoinRoomOutput {
    const ts = this.now(input.now);
    const room = this.repository.get(input.roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");
    if (room.status !== "waiting") throw new RoomError("ROOM_NOT_WAITING");
    if (room.members.length >= 4) throw new RoomError("ROOM_FULL");

    const playerId = this.genPlayerId();
    const sessionToken = this.genSessionToken();

    const member: RoomMember = {
      playerId,
      nickname: input.nickname,
      isHost: false,
      isConnected: true,
      joinedAt: ts,
      sessionToken,
    };

    room.members.push(member);
    room.updatedAt = ts;
    this.repository.set(room);
    return { room, playerId, sessionToken };
  }

  // -----------------------------------------------------------------------
  // 退出房间（主动离开）
  // -----------------------------------------------------------------------

  leaveRoom(roomId: RoomId, playerId: PlayerId): Room {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");

    const memberIdx = room.members.findIndex((m) => m.playerId === playerId);
    if (memberIdx === -1) throw new RoomError("PLAYER_NOT_FOUND");

    const now = 0;

    if (room.status === "waiting") {
      // 游戏开始前：从 members 中移除
      const [removed] = room.members.splice(memberIdx, 1);

      // 如果退出的是房主，转移给剩余第一位
      if (removed!.isHost && room.members.length > 0) {
        room.members[0]!.isHost = true;
        room.hostPlayerId = room.members[0]!.playerId;
      }

      // 如果房间没人了，删除房间
      if (room.members.length === 0) {
        this.repository.delete(roomId);
        return room;
      }

      room.updatedAt = now;
      this.repository.set(room);
      return room;
    }

    // 游戏开始后：不删除成员，只断开连接
    const member = room.members[memberIdx]!;
    member.isConnected = false;

    if (room.gameState) {
      const player = room.gameState.players.find((p) => p.id === playerId);
      if (player) player.isConnected = false;
    }

    room.updatedAt = now;
    this.repository.set(room);
    return room;
  }

  // -----------------------------------------------------------------------
  // 断线（socket disconnect — 不移除成员）
  // -----------------------------------------------------------------------

  disconnect(roomId: RoomId, playerId: PlayerId): Room {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");

    const member = room.members.find((m) => m.playerId === playerId);
    if (!member) throw new RoomError("PLAYER_NOT_FOUND");

    member.isConnected = false;

    if (room.gameState) {
      const player = room.gameState.players.find((p) => p.id === playerId);
      if (player) player.isConnected = false;
    }

    room.updatedAt = 0;
    this.repository.set(room);
    return room;
  }

  // -----------------------------------------------------------------------
  // 重连
  // -----------------------------------------------------------------------

  reconnect(input: ReconnectInput): Room {
    // 必须先验证会话令牌
    this.verifySession(input.roomId, input.playerId, input.sessionToken);

    const room = this.repository.get(input.roomId)!;
    const member = room.members.find((m) => m.playerId === input.playerId)!;

    member.isConnected = true;

    if (room.gameState) {
      const player = room.gameState.players.find((p) => p.id === input.playerId);
      if (player) player.isConnected = true;
    }

    room.updatedAt = 0;
    this.repository.set(room);
    return room;
  }

  // -----------------------------------------------------------------------
  // 开始游戏
  // -----------------------------------------------------------------------

  startGame(roomId: RoomId, hostPlayerId: PlayerId): Room {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");
    if (room.hostPlayerId !== hostPlayerId) throw new RoomError("NOT_HOST");
    if (room.status !== "waiting") throw new RoomError("ROOM_NOT_WAITING");
    if (room.members.length < 2 || room.members.length > 4) {
      throw new RoomError("INVALID_ROOM_PLAYER_COUNT");
    }

    const gameState = createInitialGameState(
      room.roomId,
      room.members.map((m) => ({ id: m.playerId, nickname: m.nickname })),
    );

    room.status = "playing";
    room.gameState = gameState;
    room.updatedAt = 0;
    this.repository.set(room);
    return room;
  }

  // -----------------------------------------------------------------------
  // 游戏动作
  // -----------------------------------------------------------------------

  applyGameActionToRoom(
    roomId: RoomId,
    playerId: PlayerId,
    action: GameAction,
  ) {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");
    if (!room.gameState) throw new RoomError("GAME_NOT_STARTED");

    if (action.playerId !== playerId) {
      throw new RoomError("PLAYER_ID_MISMATCH");
    }

    const result = applyGameAction(room.gameState, action);
    room.gameState = result.state;

    if (result.state.status === "finished") {
      room.status = "finished";
    }

    room.updatedAt = 0;
    this.repository.set(room);
    return this.getPlayerView(roomId, playerId);
  }

  // -----------------------------------------------------------------------
  // 查询
  // -----------------------------------------------------------------------

  getRoom(roomId: RoomId): Room | undefined {
    return this.repository.get(roomId);
  }

  getPlayerView(roomId: RoomId, playerId: PlayerId): PlayerGameView {
    const room = this.repository.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND");
    if (!room.gameState) throw new RoomError("GAME_NOT_STARTED");

    return createPlayerGameView(room.gameState, playerId);
  }

  // -----------------------------------------------------------------------
  // 测试辅助
  // -----------------------------------------------------------------------

  /** 清空所有数据（仅测试用） */
  clear(): void {
    this.repository.clear();
    this.nextRoomSeq = 1;
    this.nextPlayerSeq = 1;
  }
}