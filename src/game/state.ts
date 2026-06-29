/**
 * 游戏初始化模块
 *
 * 提供游戏初始状态创建相关纯函数：
 * - 空牌列
 * - 空弃牌堆
 * - 初始玩家状态
 * - 初始 GameState（牌堆生成、洗牌、发牌、先手随机）
 */

import { INITIAL_HAND_SIZE, PLAYER_EXTRA_TIME_POOL_SECONDS } from "./constants";
import { createDeck, shuffleDeck } from "./deck";
import { RULE_ERROR_CODES, RuleError } from "./errors";
import { mathRandomSource } from "./rng";
import type { RandomSource } from "./rng";
import type {
  Card,
  CardColor,
  GameState,
  PlayerColumn,
  PlayerId,
  PlayerState,
  RoomId,
} from "./types";

// ---------------------------------------------------------------------------
// 空区域工厂
// ---------------------------------------------------------------------------

/**
 * 创建 5 个空颜色牌列。
 *
 * @returns 按颜色索引的空牌列集合
 */
export function createEmptyColumns(): Record<CardColor, PlayerColumn> {
  return {
    red: { color: "red", cards: [], statusEffects: [] },
    blue: { color: "blue", cards: [], statusEffects: [] },
    yellow: { color: "yellow", cards: [], statusEffects: [] },
    green: { color: "green", cards: [], statusEffects: [] },
    white: { color: "white", cards: [], statusEffects: [] },
  };
}

/**
 * 创建 5 个空弃牌堆。
 *
 * @returns 按颜色索引的空弃牌堆集合
 */
export function createEmptyDiscardPiles(): Record<CardColor, Card[]> {
  return {
    red: [],
    blue: [],
    yellow: [],
    green: [],
    white: [],
  };
}

// ---------------------------------------------------------------------------
// 玩家状态
// ---------------------------------------------------------------------------

/**
 * 创建基础玩家状态（手牌为空，牌列为空，connected 为 true）。
 *
 * @param playerId 玩家 ID
 * @param nickname 玩家昵称
 * @returns 初始化的 PlayerState
 */
export function createPlayerState(
  playerId: PlayerId,
  nickname: string,
): PlayerState {
  return {
    id: playerId,
    nickname,
    hand: [],
    columns: createEmptyColumns(),
    statusEffects: [],
    isConnected: true,
    extraTimeRemainingSeconds: PLAYER_EXTRA_TIME_POOL_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// 游戏初始状态
// ---------------------------------------------------------------------------

/**
 * 创建初始 GameState。
 *
 * 流程：
 * 1. 校验玩家数 2–4 人
 * 2. 根据人数生成并洗牌牌堆
 * 3. 按玩家顺序每人连续发 8 张手牌（前 8 张给第 1 人，次 8 张给第 2 人，以此类推）
 * 4. 剩余牌留在 deck
 * 5. 创建 5 个空弃牌堆
 * 6. 随机先手（使用 randomSource）
 * 7. 状态设为 `playing` / `play` / turnNumber=1
 *
 * @param roomId 房间 ID
 * @param players 玩家列表（2–4 人）
 * @param randomSource 随机源（洗牌和随机先手共用），默认 Math.random
 * @returns 初始化后的 GameState
 * @throws {RuleError} 当玩家数不是 2、3、4 时抛出 INVALID_PLAYER_COUNT
 */
export function createInitialGameState(
  roomId: RoomId,
  players: Array<{ id: PlayerId; nickname: string }>,
  randomSource: RandomSource = mathRandomSource,
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new RuleError(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
  }

  const playerCount = players.length as 2 | 3 | 4;

  // 1. 生成并洗牌
  const deck = createDeck(playerCount);
  const shuffled = shuffleDeck(deck, randomSource);

  // 2. 发牌：每人连续 8 张
  const playerStates: PlayerState[] = [];
  let drawIndex = 0;

  for (const player of players) {
    const hand = shuffled.slice(drawIndex, drawIndex + INITIAL_HAND_SIZE);
    drawIndex += INITIAL_HAND_SIZE;

    playerStates.push({
      id: player.id,
      nickname: player.nickname,
      hand,
      columns: createEmptyColumns(),
      statusEffects: [],
      isConnected: true,
      extraTimeRemainingSeconds: PLAYER_EXTRA_TIME_POOL_SECONDS,
    });
  }

  // 剩余牌堆
  const remainingDeck = shuffled.slice(drawIndex);

  // 3. 随机先手
  const firstPlayerIndex = Math.floor(
    randomSource.next() * players.length,
  );
  const currentPlayerId = playerStates[firstPlayerIndex]!.id;

  // 4. 组装 GameState
  return {
    roomId,
    status: "playing",
    phase: "play",
    players: playerStates,
    currentPlayerId,
    turnNumber: 1,
    deck: remainingDeck,
    discardPiles: createEmptyDiscardPiles(),
    lastDiscardedThisTurn: undefined,
    operationStartedAt: undefined,
    statusEffects: [],
    events: [],
    finalResult: undefined,
  };
}