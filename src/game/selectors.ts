/**
 * 游戏状态查询选择器
 *
 * 提供只读查询函数，不修改游戏状态。
 */

import { canPlaceCard, isColumnClosed } from "./column";
import { CARD_COLORS } from "./constants";
import type { GameState, PlayerId } from "./types";

/**
 * 检查玩家是否至少有一个合法出牌动作。
 *
 * 判定逻辑：
 * 1. 找到该玩家。
 * 2. 遍历手牌：
 *    - 非万能牌 → 至少可以弃牌 → 有合法动作。
 *    - 万能牌 → 不能弃置，但可以尝试放入任意未关闭的颜色列。
 *    - 无论如何，如果任意牌可放入任意列 → 有合法动作。
 * 3. 如果既无弃牌也无放置，返回 false。
 *
 * @param state 当前游戏状态
 * @param playerId 玩家 ID
 * @returns 是否有合法动作
 */
export function hasAnyLegalPlay(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;

  for (const card of player.hand) {
    // 非万能牌可以弃置（无条件合法）
    if (card.type !== "wild") {
      return true;
    }

    // 万能牌：检查是否有未关闭的列可放入
    for (const color of CARD_COLORS) {
      const column = player.columns[color]!;
      if (!isColumnClosed(column) && canPlaceCard(column, card)) {
        return true;
      }
    }
  }

  return false;
}