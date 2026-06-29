/**
 * 牌堆生成与洗牌模块
 *
 * 负责根据玩家人数创建对应规模的牌堆，并提供 Fisher-Yates 洗牌功能。
 */

import { CARD_COLORS } from "./constants";
import { RULE_ERROR_CODES, RuleError } from "./errors";
import type { RandomSource } from "./rng";
import { mathRandomSource } from "./rng";
import type { Card, CardColor, CardId, MultiplierCard, NumberCard, NumberValue, WildCard } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 为数字牌生成唯一可读 ID */
function numberCardId(color: CardColor, value: NumberValue, suffix: string): CardId {
  return `${color}-number-${value}-${suffix}` as CardId;
}

/** 为加倍卡生成唯一可读 ID */
function multiplierCardId(color: CardColor, suffix: string): CardId {
  return `${color}-multiplier-${suffix}` as CardId;
}

/** 为万能牌生成唯一可读 ID */
function wildCardId(suffix: string): CardId {
  return `wild-${suffix}` as CardId;
}

/** 创建一张数字牌 */
function makeNumberCard(color: CardColor, value: NumberValue, suffix: string): NumberCard {
  return {
    id: numberCardId(color, value, suffix),
    type: "number",
    color,
    value,
  };
}

/** 创建一张加倍卡 */
function makeMultiplierCard(color: CardColor, suffix: string): MultiplierCard {
  return {
    id: multiplierCardId(color, suffix),
    type: "multiplier",
    color,
  };
}

/** 创建一张万能牌 */
function makeWildCard(suffix: string): WildCard {
  return {
    id: wildCardId(suffix),
    type: "wild",
  };
}

// ---------------------------------------------------------------------------
// 基础牌堆（2 人用）
// ---------------------------------------------------------------------------

function createBaseDeck(): Card[] {
  const cards: Card[] = [];

  for (const color of CARD_COLORS) {
    // 数字牌 2–10 各 1 张
    for (let v = 2; v <= 10; v++) {
      cards.push(makeNumberCard(color, v as NumberValue, "base"));
    }
    // 加倍卡 3 张
    for (let i = 1; i <= 3; i++) {
      cards.push(makeMultiplierCard(color, `base-${i}`));
    }
  }

  return cards;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 根据玩家人数创建牌堆。
 *
 * - 2 人：60 张（基础牌堆）
 * - 3 人：82 张（基础牌堆 + 万能牌 2 张 + 每色额外数字 2-5）
 * - 4 人：108 张（3 人牌堆 + 万能牌 1 张 + 每色额外数字 6-9 + 每色额外加倍卡 1 张）
 *
 * @throws {RuleError} 当 playerCount 不是 2、3、4 时抛出 INVALID_PLAYER_COUNT
 */
export function createDeck(playerCount: 2 | 3 | 4): Card[] {
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    throw new RuleError(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
  }

  // 基础牌堆（2 人）
  const cards = createBaseDeck();

  // ---- 3 人扩充 ----
  if (playerCount >= 3) {
    // 万能牌 2 张
    cards.push(makeWildCard("3p-1"));
    cards.push(makeWildCard("3p-2"));

    // 每种颜色额外数字 2、3、4、5 各 1 张
    for (const color of CARD_COLORS) {
      for (const v of [2, 3, 4, 5] as const) {
        cards.push(makeNumberCard(color, v, "3p"));
      }
    }
  }

  // ---- 4 人扩充 ----
  if (playerCount >= 4) {
    // 万能牌 1 张
    cards.push(makeWildCard("4p-1"));

    // 每种颜色额外数字 6、7、8、9 各 1 张
    for (const color of CARD_COLORS) {
      for (const v of [6, 7, 8, 9] as const) {
        cards.push(makeNumberCard(color, v, "4p"));
      }
      // 每种颜色额外加倍卡 1 张
      cards.push(makeMultiplierCard(color, "4p"));
    }
  }

  return cards;
}

/**
 * Fisher-Yates 洗牌算法。
 *
 * - 不修改原数组，返回新数组
 * - 支持通过 `randomSource` 注入随机源，方便测试
 *
 * @param deck 待洗牌的牌堆
 * @param randomSource 随机源，默认使用 Math.random()
 * @returns 洗牌后的新牌堆
 */
export function shuffleDeck(deck: Card[], randomSource: RandomSource = mathRandomSource): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomSource.next() * (i + 1));
    // 安全交换 —— j 通过取整保证在 [0, i] 范围内
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}