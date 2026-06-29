/**
 * 玩家视角 DTO
 *
 * 从权威 GameState 中提取每个玩家可见的视图。
 * 禁止直接暴露完整 GameState（所有玩家手牌、牌堆顺序等）。
 */

import { RULE_ERROR_CODES, RuleError } from "./errors";
import type {
  Card,
  CardColor,
  FinalResult,
  GameEvent,
  GamePhase,
  GameState,
  GameStatus,
  PlayerColumn,
  PlayerId,
  RoomId,
} from "./types";

// ---------------------------------------------------------------------------
// 公开类型
// ---------------------------------------------------------------------------

/** 其他玩家的公开视图（不含手牌内容） */
export interface PublicPlayerView {
  id: PlayerId;
  nickname: string;
  handCount: number;
  columns: Record<CardColor, PlayerColumn>;
  isConnected: boolean;
}

/** 自己的视图（包含完整手牌） */
export interface SelfPlayerView extends PublicPlayerView {
  hand: Card[];
}

/** 玩家所在游戏的完整可见视图 */
export interface PlayerGameView {
  roomId: RoomId;
  status: GameStatus;
  phase: GamePhase;
  currentPlayerId?: PlayerId;
  turnNumber: number;
  self: SelfPlayerView;
  players: PublicPlayerView[];
  /** 牌堆剩余数量，不暴露牌堆内容 */
  deckCount: number;
  /** 公开弃牌堆（公共信息） */
  discardPiles: Record<CardColor, Card[]>;
  /** 公开事件日志 */
  events: GameEvent[];
  /** 游戏结束后的最终排名（如有） */
  finalResult?: FinalResult;
}

// ---------------------------------------------------------------------------
// 视图创建函数
// ---------------------------------------------------------------------------

/**
 * 根据权威 GameState 和指定观察者 ID 创建玩家视角视图。
 *
 * - `self.hand` 包含 viewer 自己的完整手牌。
 * - `players[]` 中所有玩家只暴露 `handCount`。
 * - `deckCount` 只暴露牌堆数量，不暴露牌堆内容和顺序。
 *
 * @param state 权威游戏状态
 * @param viewerId 观察者玩家 ID
 * @returns 玩家可见的游戏视图
 * @throws {RuleError} 当 viewerId 不存在时抛出 NOT_CURRENT_PLAYER
 */
export function createPlayerGameView(
  state: GameState,
  viewerId: PlayerId,
): PlayerGameView {
  const selfPlayer = state.players.find((p) => p.id === viewerId);
  if (!selfPlayer) {
    throw new RuleError(RULE_ERROR_CODES.NOT_CURRENT_PLAYER);
  }

  const self: SelfPlayerView = {
    id: selfPlayer.id,
    nickname: selfPlayer.nickname,
    handCount: selfPlayer.hand.length,
    hand: selfPlayer.hand,
    columns: selfPlayer.columns,
    isConnected: selfPlayer.isConnected,
  };

  const players: PublicPlayerView[] = state.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    handCount: p.hand.length,
    columns: p.columns,
    isConnected: p.isConnected,
  }));

  return {
    roomId: state.roomId,
    status: state.status,
    phase: state.phase,
    currentPlayerId: state.currentPlayerId,
    turnNumber: state.turnNumber,
    self,
    players,
    deckCount: state.deck.length,
    discardPiles: state.discardPiles,
    events: state.events,
    finalResult: state.finalResult,
  };
}