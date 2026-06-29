/**
 * 计分与排名模块
 *
 * 提供牌列计分、玩家总分、最终排名计算的纯函数。
 */

import { getEvaluatedColumnCards } from "./column";
import { CARD_COLORS } from "./constants";
import type {
  CardColor,
  FinalResult,
  PlayerColumn,
  PlayerId,
  PlayerState,
  RankingEntry,
} from "./types";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 单个颜色列的计分明细 */
export interface ColumnScore {
  /** 列颜色 */
  color: CardColor;
  /** 该列是否已建立（至少有一张牌） */
  isEstablished: boolean;
  /** 数字和（数字牌 + 作为数字使用的万能牌的有效数字之和） */
  numberSum: number;
  /** 基础分 = 数字和 - 20 */
  baseScore: number;
  /** 列首连续加倍卡数量（包括作为加倍卡的万能牌） */
  multiplierCount: number;
  /** 倍率 = 加倍卡数量 + 1 */
  multiplier: number;
  /** 列得分 = 基础分 × 倍率；未建立列为 0 */
  score: number;
}

/** 玩家计分结果 */
export interface PlayerScore {
  /** 玩家 ID */
  playerId: PlayerId;
  /** 玩家昵称 */
  nickname: string;
  /** 各颜色列计分明细 */
  columnScores: Record<CardColor, ColumnScore>;
  /** 总分 = 5 个颜色列得分之和 */
  totalScore: number;
}

// ---------------------------------------------------------------------------
// 牌列计分
// ---------------------------------------------------------------------------

/**
 * 计算单个牌列的得分。
 *
 * 规则：
 * 1. 未建立列（无任何牌）→ score = 0
 * 2. 已建立列 → baseScore = numberSum - 20 → score = baseScore × (multiplierCount + 1)
 *
 * numberSum 包括普通数字牌和作为数字使用的万能牌的有效数字。
 * multiplierCount 为列首连续加倍卡数量（包括作为加倍卡使用的万能牌）。
 *
 * @param column 待计分的牌列
 * @returns 列计分明细
 */
export function calculateColumnScore(column: PlayerColumn): ColumnScore {
  // 未建立列
  if (column.cards.length === 0) {
    return {
      color: column.color,
      isEstablished: false,
      numberSum: 0,
      baseScore: 0,
      multiplierCount: 0,
      multiplier: 1,
      score: 0,
    };
  }

  const evaluated = getEvaluatedColumnCards(column);

  // 数字和：所有有效数字的总和
  let numberSum = 0;
  for (const ev of evaluated) {
    if (ev.effectiveValue !== undefined) {
      numberSum += ev.effectiveValue;
    }
  }

  // 列首连续加倍卡数量：从 index 0 开始，遇到第一个非加倍卡即停止
  let multiplierCount = 0;
  for (const ev of evaluated) {
    if (ev.role.type === "multiplier") {
      multiplierCount++;
    } else {
      break;
    }
  }

  const baseScore = numberSum - 20;
  const multiplier = multiplierCount + 1;
  const score = baseScore * multiplier;

  return {
    color: column.color,
    isEstablished: true,
    numberSum,
    baseScore,
    multiplierCount,
    multiplier,
    score,
  };
}

// ---------------------------------------------------------------------------
// 玩家总分
// ---------------------------------------------------------------------------

/**
 * 计算单个玩家的总分。
 *
 * 遍历 5 个颜色列，分别计分后求和。
 * 不修改原 player 对象。
 *
 * @param player 玩家状态
 * @returns 玩家计分结果
 */
export function calculatePlayerScore(player: PlayerState): PlayerScore {
  const columnScores = {} as Record<CardColor, ColumnScore>;
  let totalScore = 0;

  for (const color of CARD_COLORS) {
    const column = player.columns[color];
    // 防御：如果某颜色列不存在，视为空列
    const colScore = column
      ? calculateColumnScore(column)
      : emptyColumnScore(color);
    columnScores[color] = colScore;
    totalScore += colScore.score;
  }

  return {
    playerId: player.id,
    nickname: player.nickname,
    columnScores,
    totalScore,
  };
}

// ---------------------------------------------------------------------------
// 最终排名
// ---------------------------------------------------------------------------

/**
 * 计算最终排名结果。
 *
 * 规则：
 * - 按总分降序排列。
 * - 总分最高者获胜，并列最高分则并列获胜。
 * - 使用竞赛排名：1, 1, 3, 4（同分同名次，后续名次跳过）。
 *
 * @param players 所有玩家状态列表
 * @returns 最终排名结果
 */
export function calculateFinalResult(players: PlayerState[]): FinalResult {
  // 计算每个玩家的分数
  const playerScores = players.map((p) => calculatePlayerScore(p));

  // 按总分降序排列
  const sorted = [...playerScores].sort((a, b) => b.totalScore - a.totalScore);

  const rankings: RankingEntry[] = [];
  const winnerIds: PlayerId[] = [];

  // 竞赛排名：同分同名次，后续跳过
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;

    // 如果与前一位分数不同，「排名」跳到当前位置 i+1
    if (i > 0 && current.totalScore < sorted[i - 1]!.totalScore) {
      rank = i + 1;
    }

    const isWinner = current.totalScore === sorted[0]!.totalScore;

    rankings.push({
      playerId: current.playerId,
      nickname: current.nickname,
      score: current.totalScore,
      rank,
      isWinner,
    });

    if (isWinner) {
      winnerIds.push(current.playerId);
    }
  }

  return { rankings, winnerIds };
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 生成一个空列的 ColumnScore */
function emptyColumnScore(color: CardColor): ColumnScore {
  return {
    color,
    isEstablished: false,
    numberSum: 0,
    baseScore: 0,
    multiplierCount: 0,
    multiplier: 1,
    score: 0,
  };
}