/**
 * 牌列解析与放置校验模块
 *
 * 提供牌列（PlayerColumn）的遍历、状态查询、放置合法性校验及不可变放置操作。
 */

import { RULE_ERROR_CODES, RuleError } from "./errors";
import type {
  Card,
  MultiplierCard,
  NumberCard,
  NumberValue,
  PlayerColumn,
  PlacedCard,
  WildCard,
  WildCardRole,
} from "./types";

// ---------------------------------------------------------------------------
// EvaluatedColumnCard – 衍生类型，表示牌列中每张牌被解析后的角色
// ---------------------------------------------------------------------------

/** 用于计分和规则判定的「已解析牌列卡片」信息 */
export interface EvaluatedColumnCard {
  /** 原始 PlacedCard */
  placed: PlacedCard;
  /** 该牌在列中的解析后角色 */
  role: WildCardRole;
  /** 如果 role.type === "number"，则为 effectiveValue；否则为 undefined */
  effectiveValue: NumberValue | undefined;
  /** 该牌在列中的索引位置 */
  index: number;
}

// ---------------------------------------------------------------------------
// 核心查询
// ---------------------------------------------------------------------------

/**
 * 遍历牌列，按放入顺序依次解析每张牌的角色。
 *
 * 万能牌角色判定规则（永久固化）：
 * - 放在第一次出现数字之前 → 永久视为加倍卡
 * - 放在第一次出现数字之后 → 永久视为 `(当前最后有效数字 + 1)`
 *
 * 角色信息存储在 PlacedCard.wildRole 中（由 placeCardInColumn 写入），
 * 本函数只做遍历和解释，不修改列状态。
 *
 * @returns 按顺序排列的已解析卡片列表
 */
export function getEvaluatedColumnCards(
  column: PlayerColumn,
): EvaluatedColumnCard[] {
  const result: EvaluatedColumnCard[] = [];

  for (let i = 0; i < column.cards.length; i++) {
    const placed = column.cards[i]!;
    const card = placed.card;

    if (card.type === "number") {
      result.push({
        placed,
        role: { type: "number", effectiveValue: card.value },
        effectiveValue: card.value,
        index: i,
      });
    } else if (card.type === "multiplier") {
      result.push({
        placed,
        role: { type: "multiplier" },
        effectiveValue: undefined,
        index: i,
      });
    } else {
      // card.type === "wild" —— placed 应为 { card: WildCard; wildRole: WildCardRole }
      if ("wildRole" in placed) {
        const wildPlaced = placed as { card: WildCard; wildRole: WildCardRole };
        result.push({
          placed: wildPlaced,
          role: wildPlaced.wildRole,
          effectiveValue:
            wildPlaced.wildRole.type === "number"
              ? wildPlaced.wildRole.effectiveValue
              : undefined,
          index: i,
        });
      } else {
        // 防御：未设置 wildRole 的万能牌（正常流程不应出现）
        result.push({
          placed,
          role: { type: "multiplier" },
          effectiveValue: undefined,
          index: i,
        });
      }
    }
  }

  return result;
}

/**
 * 获取牌列中最后一个有效数字。
 *
 * 计算逻辑：
 * - 扫描所有已解析卡片
 * - 取最后一个 `effectiveValue` 不为 undefined 的卡片的值
 *
 * @returns 最后有效数字，若无数字牌则返回 undefined
 */
export function getLastEffectiveNumber(
  column: PlayerColumn,
): NumberValue | undefined {
  const evaluated = getEvaluatedColumnCards(column);
  for (let i = evaluated.length - 1; i >= 0; i--) {
    const ev = evaluated[i]!;
    if (ev.effectiveValue !== undefined) {
      return ev.effectiveValue;
    }
  }
  return undefined;
}

/**
 * 判断牌列中是否已出现数字（包括数字牌和作为数字使用的万能牌）。
 *
 * @returns 如果列中至少存在一个有效数字，返回 true
 */
export function hasNumberInColumn(column: PlayerColumn): boolean {
  if (column.cards.length === 0) return false;
  const evaluated = getEvaluatedColumnCards(column);
  return evaluated.some((ev) => ev.effectiveValue !== undefined);
}

/**
 * 判断牌列是否已关闭（最后有效数字达到 10）。
 *
 * 关闭后该列不能再放任何牌：数字牌、加倍卡、万能牌都不行。
 *
 * @returns 当最后有效数字为 10 时返回 true
 */
export function isColumnClosed(column: PlayerColumn): boolean {
  const last = getLastEffectiveNumber(column);
  return last === 10;
}

// ---------------------------------------------------------------------------
// 放置合法性
// ---------------------------------------------------------------------------

/**
 * 判断一张牌是否可以放入指定牌列。
 *
 * 规则摘要：
 *
 * **颜色规则**
 * - 数字牌/加倍卡的颜色必须与列颜色一致。
 * - 万能牌没有颜色限制。
 *
 * **10 封顶**
 * - 列关闭（最后有效数字 = 10）后拒绝所有牌。
 *
 * **加倍卡**
 * - 只能放在数字牌出现之前。
 *
 * **数字牌**
 * - 如果列中尚无有效数字，可以放入任意符合颜色的数字牌。
 * - 如果列中已有有效数字，新数字必须严格大于当前最后的有效数字。
 *
 * **万能牌**
 * - 总能放入未关闭的列。
 * - 放入时角色按该列是否已有数字决定。
 */
export function canPlaceCard(column: PlayerColumn, card: Card): boolean {
  // 列已关闭，拒绝一切
  if (isColumnClosed(column)) {
    return false;
  }

  const lastNumber = getLastEffectiveNumber(column);
  const hasNumber = hasNumberInColumn(column);

  if (card.type === "wild") {
    // 万能牌：只要列未关闭就可放入
    return true;
  }

  if (card.type === "number") {
    // 颜色必须匹配
    if (card.color !== column.color) return false;

    // 如果有有效数字，必须严格递增
    if (hasNumber && lastNumber !== undefined) {
      return card.value > lastNumber;
    }
    // 尚无数字，可放入
    return true;
  }

  // card.type === "multiplier"
  if (card.color !== column.color) return false;

  // 加倍卡只能在数字出现前放入
  if (hasNumber) return false;

  return true;
}

// ---------------------------------------------------------------------------
// 不可变放置
// ---------------------------------------------------------------------------

/**
 * 不可变地将一张牌放入牌列。
 *
 * - 不修改原 column 对象
 * - 返回新的 `PlayerColumn`
 * - 如果无法放置，抛出 `RuleError(ILLEGAL_COLUMN_PLACEMENT)`
 * - 万能牌在放入时确定 `wildRole`（先当加倍卡，有数字时当数字）
 *
 * @throws {RuleError} 当放置不合法时抛出 ILLEGAL_COLUMN_PLACEMENT
 */
export function placeCardInColumn(
  column: PlayerColumn,
  card: Card,
): PlayerColumn {
  if (!canPlaceCard(column, card)) {
    throw new RuleError(RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT);
  }

  let placedCard: PlacedCard;

  if (card.type === "wild") {
    // 决定万能牌角色：如果列中尚无数字，视为加倍卡；否则视为数字
    const hasNumber = hasNumberInColumn(column);

    if (hasNumber) {
      const last = getLastEffectiveNumber(column)!;
      const effectiveValue = (last + 1) as NumberValue;
      placedCard = {
        card,
        wildRole: { type: "number", effectiveValue },
      };
    } else {
      placedCard = {
        card,
        wildRole: { type: "multiplier" },
      };
    }
  } else {
    // 数字牌 或 加倍卡：直接放入
    placedCard = {
      card: card as NumberCard | MultiplierCard,
    };
  }

  return {
    ...column,
    cards: [...column.cards, placedCard],
    statusEffects: [...column.statusEffects],
  };
}