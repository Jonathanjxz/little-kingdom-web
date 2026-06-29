/**
 * 计分与排名模块 单元测试
 */

import { describe, expect, it } from "vitest";
import { placeCardInColumn } from "../../src/game/column";
import { CARD_COLORS } from "../../src/game/constants";
import {
  calculateColumnScore,
  calculateFinalResult,
  calculatePlayerScore,
} from "../../src/game/scoring";
import type {
  CardColor,
  CardId,
  MultiplierCard,
  NumberCard,
  NumberValue,
  PlayerColumn,
  PlayerId,
  PlayerState,
  WildCard,
} from "../../src/game/types";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

function cid(s: string): CardId {
  return s as CardId;
}
function pid(s: string): PlayerId {
  return s as PlayerId;
}

function nCard(color: string, value: number, id: string): NumberCard {
  return {
    id: cid(id),
    type: "number",
    color: color as NumberCard["color"],
    value: value as NumberValue,
  };
}
function mCard(color: string, id: string): MultiplierCard {
  return {
    id: cid(id),
    type: "multiplier",
    color: color as MultiplierCard["color"],
  };
}
function wCard(id: string): WildCard {
  return { id: cid(id), type: "wild" };
}

function rN(value: number, id: string) {
  return nCard("red", value, id);
}
function rM(id: string) {
  return mCard("red", id);
}

function emptyColumn(color: CardColor): PlayerColumn {
  return { color, cards: [], statusEffects: [] };
}

function buildColumn(
  color: CardColor,
  ...cards: (NumberCard | MultiplierCard | WildCard)[]
): PlayerColumn {
  let col = emptyColumn(color);
  for (const c of cards) {
    col = placeCardInColumn(col, c);
  }
  return col;
}

function makePlayer(
  id: string,
  nickname: string,
  columns: Record<CardColor, PlayerColumn>,
): PlayerState {
  return {
    id: pid(id),
    nickname,
    hand: [],
    columns,
    statusEffects: [],
    isConnected: true,
    extraTimeRemainingSeconds: 50,
  };
}

/** 创建一个只有 red 列有牌的玩家，其余颜色列为空 */
function playerWithRedColumn(
  id: string,
  nickname: string,
  ...cards: (NumberCard | MultiplierCard | WildCard)[]
): PlayerState {
  return makePlayer(id, nickname, {
    red: buildColumn("red", ...cards),
    blue: emptyColumn("blue"),
    yellow: emptyColumn("yellow"),
    green: emptyColumn("green"),
    white: emptyColumn("white"),
  } as Record<CardColor, PlayerColumn>);
}

/** 创建一个所有颜色列都为空的玩家（总分为 0） */
function allEmptyPlayer(id: string, nickname: string): PlayerState {
  return makePlayer(id, nickname, {
    red: emptyColumn("red"),
    blue: emptyColumn("blue"),
    yellow: emptyColumn("yellow"),
    green: emptyColumn("green"),
    white: emptyColumn("white"),
  } as Record<CardColor, PlayerColumn>);
}

// ---------------------------------------------------------------------------
// 空列计分
// ---------------------------------------------------------------------------

describe("空列计分", () => {
  it("空列得 0 分", () => {
    const col = emptyColumn("red");
    const score = calculateColumnScore(col);
    expect(score.isEstablished).toBe(false);
    expect(score.numberSum).toBe(0);
    expect(score.baseScore).toBe(0);
    expect(score.multiplierCount).toBe(0);
    expect(score.multiplier).toBe(1);
    expect(score.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 普通数字列计分
// ---------------------------------------------------------------------------

describe("普通数字列计分", () => {
  it("普通数字列按数字和 - 20 计分", () => {
    // [2][5][8] → 数字和 = 15, base = -5, ×1 → -5
    const col = buildColumn("red", rN(2, "r2"), rN(5, "r5"), rN(8, "r8"));
    const score = calculateColumnScore(col);
    expect(score.isEstablished).toBe(true);
    expect(score.numberSum).toBe(15);
    expect(score.baseScore).toBe(-5);
    expect(score.score).toBe(-5);
  });

  it("正分列计分正确", () => {
    // [7][8][9] → 数字和 = 24, base = 4, ×1 → 4
    const col = buildColumn("red", rN(7, "r7"), rN(8, "r8"), rN(9, "r9"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(24);
    expect(score.baseScore).toBe(4);
    expect(score.score).toBe(4);
  });

  it("负分列计分正确", () => {
    // [2] → 数字和 = 2, base = -18, ×1 → -18
    const col = buildColumn("red", rN(2, "r2"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(2);
    expect(score.baseScore).toBe(-18);
    expect(score.score).toBe(-18);
  });
});

// ---------------------------------------------------------------------------
// 加倍卡计分
// ---------------------------------------------------------------------------

describe("加倍卡计分", () => {
  it("1 张加倍卡正确提升倍率", () => {
    // [加倍卡][3][6] → 数字和 = 9, base = -11, multiplierCount = 1, ×2 → -22
    const col = buildColumn("red", rM("m1"), rN(3, "r3"), rN(6, "r6"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(9);
    expect(score.baseScore).toBe(-11);
    expect(score.multiplierCount).toBe(1);
    expect(score.multiplier).toBe(2);
    expect(score.score).toBe(-22);
  });

  it("多张加倍卡正确提升倍率", () => {
    // [加倍卡][加倍卡][加倍卡][5] → 数字和 = 5, base = -15, ×4 → -60
    const col = buildColumn("red", rM("m1"), rM("m2"), rM("m3"), rN(5, "r5"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(5);
    expect(score.baseScore).toBe(-15);
    expect(score.multiplierCount).toBe(3);
    expect(score.multiplier).toBe(4);
    expect(score.score).toBe(-60);
  });

  it("只有加倍卡的列产生高负分", () => {
    // [加倍卡][加倍卡] → 数字和 = 0, base = -20, ×3 → -60
    const col = buildColumn("red", rM("m1"), rM("m2"));
    const score = calculateColumnScore(col);
    expect(score.isEstablished).toBe(true);
    expect(score.numberSum).toBe(0);
    expect(score.baseScore).toBe(-20);
    expect(score.multiplierCount).toBe(2);
    expect(score.multiplier).toBe(3);
    expect(score.score).toBe(-60);
  });
});

// ---------------------------------------------------------------------------
// 万能牌计分
// ---------------------------------------------------------------------------

describe("万能牌计分", () => {
  it("作为加倍卡的万能牌计入倍率", () => {
    // [万能牌][加倍卡][2][4] → multiplierCount = 2, numberSum = 6, base = -14, ×3 → -42
    const col = buildColumn("red", wCard("w1"), rM("m1"), rN(2, "r2"), rN(4, "r4"));
    const score = calculateColumnScore(col);
    expect(score.multiplierCount).toBe(2);
    expect(score.multiplier).toBe(3);
    expect(score.numberSum).toBe(6);
    expect(score.baseScore).toBe(-14);
    expect(score.score).toBe(-42);
  });

  it("作为数字的万能牌计入数字和", () => {
    // [2][4][万能牌] → 万能牌视为 5, numberSum = 11, base = -9, ×1 → -9
    let col = buildColumn("red", rN(2, "r2"), rN(4, "r4"));
    col = placeCardInColumn(col, wCard("w1"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(11);
    expect(score.baseScore).toBe(-9);
    expect(score.multiplierCount).toBe(0);
    expect(score.score).toBe(-9);
  });

  it("连续作为数字的万能牌依次计入数字和", () => {
    // [2][4][万能牌][万能牌] → 5, 6 → numberSum = 17, base = -3, ×1 → -3
    let col = buildColumn("red", rN(2, "r2"), rN(4, "r4"));
    col = placeCardInColumn(col, wCard("w1"));
    col = placeCardInColumn(col, wCard("w2"));
    const score = calculateColumnScore(col);
    expect(score.numberSum).toBe(17);
    expect(score.score).toBe(-3);
  });

  it("万能牌作为加倍卡和普通加倍卡混合时倍率正确", () => {
    // [万能牌][万能牌][加倍卡][2][万能牌]
    // multiplierCount = 3 (w1, w2, m1), numberSum = 2 + 3 = 5, ×4 → -60
    const col = buildColumn("red", wCard("w1"), wCard("w2"), rM("m1"), rN(2, "r2"), wCard("w3"));
    const score = calculateColumnScore(col);
    expect(score.multiplierCount).toBe(3);
    expect(score.multiplier).toBe(4);
    expect(score.numberSum).toBe(5);
    expect(score.score).toBe(-60);
  });
});

// ---------------------------------------------------------------------------
// 颜色列独立性与玩家总分
// ---------------------------------------------------------------------------

describe("颜色列独立性与玩家总分", () => {
  it("每个颜色列独立计分", () => {
    // red: [2][5] → 数字和 = 7, base = -13, ×1 → -13
    // blue: [加倍卡][8] → 数字和 = 8, base = -12, ×2 → -24
    // yellow: 空列 → 0
    // green: [加倍卡] → 数字和 = 0, base = -20, ×2 → -40
    // white: 空列 → 0
    // 总分 = -13 + (-24) + 0 + (-40) + 0 = -77
    const player = makePlayer("p1", "Alice", {
      red: buildColumn("red", rN(2, "r2"), rN(5, "r5")),
      blue: buildColumn("blue", mCard("blue", "bm1"), nCard("blue", 8, "b8")),
      yellow: emptyColumn("yellow"),
      green: buildColumn("green", mCard("green", "gm1")),
      white: emptyColumn("white"),
    } as Record<CardColor, PlayerColumn>);

    const score = calculatePlayerScore(player);
    expect(score.columnScores["red"]!.score).toBe(-13);
    expect(score.columnScores["blue"]!.score).toBe(-24);
    expect(score.columnScores["yellow"]!.score).toBe(0);
    expect(score.columnScores["green"]!.score).toBe(-40);
    expect(score.columnScores["white"]!.score).toBe(0);
    expect(score.totalScore).toBe(-77);
  });

  it("未建立颜色列不扣 20 分", () => {
    const player = allEmptyPlayer("p1", "Bob");
    const score = calculatePlayerScore(player);
    expect(score.totalScore).toBe(0);
    for (const color of CARD_COLORS) {
      expect(score.columnScores[color]!.score).toBe(0);
      expect(score.columnScores[color]!.isEstablished).toBe(false);
    }
  });

  it("玩家总分等于 5 个颜色列得分之和", () => {
    // red: [2][5] → -13
    // blue: [8] → -12
    // yellow: [加倍卡][3] → 数字和=3, base=-17, ×2 → -34
    // green: [9] → -11
    // white: 空列 → 0
    // 总分 = -70
    const player = makePlayer("p1", "Alice", {
      red: buildColumn("red", rN(2, "r2"), rN(5, "r5")),
      blue: buildColumn("blue", nCard("blue", 8, "b8")),
      yellow: buildColumn("yellow", mCard("yellow", "ym1"), nCard("yellow", 3, "y3")),
      green: buildColumn("green", nCard("green", 9, "g9")),
      white: emptyColumn("white"),
    } as Record<CardColor, PlayerColumn>);

    const score = calculatePlayerScore(player);
    expect(score.columnScores["red"]!.score).toBe(-13);
    expect(score.columnScores["blue"]!.score).toBe(-12);
    expect(score.columnScores["yellow"]!.score).toBe(-34);
    expect(score.columnScores["green"]!.score).toBe(-11);
    expect(score.columnScores["white"]!.score).toBe(0);
    expect(score.totalScore).toBe(-70);
  });
});

// ---------------------------------------------------------------------------
// 最终排名
// ---------------------------------------------------------------------------

describe("最终排名", () => {
  it("多名玩家最终排名按总分降序", () => {
    const result = calculateFinalResult([
      // [10] → -10
      playerWithRedColumn("p1", "A", rN(10, "r10")),
      // [9][10] → 数字和=19, base=-1 → -1
      playerWithRedColumn("p2", "B", rN(9, "r9"), rN(10, "r10a")),
      // [7][8][9][10] → 数字和=34, base=14 → 14
      playerWithRedColumn("p3", "C", rN(7, "r7"), rN(8, "r8"), rN(9, "r9a"), rN(10, "r10b")),
      // [7][8][9][10] → 14
      playerWithRedColumn("p4", "D", rN(7, "r7d"), rN(8, "r8d"), rN(9, "r9d"), rN(10, "r10d")),
    ]);

    expect(result.rankings).toHaveLength(4);
    expect(result.rankings[0]!.playerId).toBe("p3");
    expect(result.rankings[1]!.playerId).toBe("p4");
    expect(result.rankings[2]!.playerId).toBe("p2");
    expect(result.rankings[3]!.playerId).toBe("p1");
  });

  it("并列最高分时多个玩家都是 winner", () => {
    const result = calculateFinalResult([
      playerWithRedColumn("p1", "A", rN(10, "r10")),
      playerWithRedColumn("p2", "B", rN(9, "r9"), rN(10, "r10a")),
      playerWithRedColumn("p3", "C", rN(7, "r7"), rN(8, "r8"), rN(9, "r9a"), rN(10, "r10b")),
      playerWithRedColumn("p4", "D", rN(7, "r7d"), rN(8, "r8d"), rN(9, "r9d"), rN(10, "r10d")),
    ]);

    expect(result.rankings[0]!.isWinner).toBe(true);
    expect(result.rankings[1]!.isWinner).toBe(true);
    expect(result.rankings[2]!.isWinner).toBe(false);
    expect(result.rankings[3]!.isWinner).toBe(false);
    expect(result.winnerIds).toEqual([pid("p3"), pid("p4")]);
  });

  it("排名编号使用竞赛排名 1,1,3", () => {
    // P1, P2: [加倍卡][8][9][10] → 数字和=27, base=7, ×2 → 14
    // P3: [2][3] → 数字和=5, base=-15, ×1 → -15
    // P4: [2] → 数字和=2, base=-18, ×1 → -18
    const result = calculateFinalResult([
      playerWithRedColumn("p1", "A", rM("m1"), rN(8, "r8"), rN(9, "r9"), rN(10, "r10")),
      playerWithRedColumn("p2", "B", rM("m2"), rN(8, "r8b"), rN(9, "r9b"), rN(10, "r10b")),
      playerWithRedColumn("p3", "C", rN(2, "r2"), rN(3, "r3")),
      playerWithRedColumn("p4", "D", rN(2, "r2d")),
    ]);

    expect(result.rankings[0]!.rank).toBe(1);
    expect(result.rankings[1]!.rank).toBe(1);
    expect(result.rankings[2]!.rank).toBe(3);
    expect(result.rankings[3]!.rank).toBe(4);
  });

  it("非第一名并列时排名正确，例如 1,2,2,4", () => {
    // P1: [加倍卡][8][9][10] → 14
    // P2, P3: [7][8] → 数字和=15, base=-5, ×1 → -5
    // P4: [2] → -18
    const result = calculateFinalResult([
      playerWithRedColumn("p1", "A", rM("m1"), rN(8, "r8"), rN(9, "r9"), rN(10, "r10")),
      playerWithRedColumn("p2", "B", rN(7, "r7"), rN(8, "r8b")),
      playerWithRedColumn("p3", "C", rN(7, "r7c"), rN(8, "r8c")),
      playerWithRedColumn("p4", "D", rN(2, "r2d")),
    ]);

    expect(result.rankings[0]!.rank).toBe(1);
    expect(result.rankings[1]!.rank).toBe(2);
    expect(result.rankings[2]!.rank).toBe(2);
    expect(result.rankings[3]!.rank).toBe(4);
  });

  it("calculateFinalResult 返回的 winnerIds 与 isWinner 一致", () => {
    const result = calculateFinalResult([
      playerWithRedColumn("p1", "A", rM("m1"), rN(8, "r8"), rN(9, "r9"), rN(10, "r10")),
      playerWithRedColumn("p2", "B", rM("m2"), rN(8, "r8b"), rN(9, "r9b"), rN(10, "r10b")),
      playerWithRedColumn("p3", "C", rN(2, "r2")),
    ]);

    const winnerIdsFromRankings = result.rankings
      .filter((r) => r.isWinner)
      .map((r) => r.playerId);
    expect(winnerIdsFromRankings).toEqual(result.winnerIds);
    expect(result.winnerIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 不可变性
// ---------------------------------------------------------------------------

describe("计分函数不可变", () => {
  it("计分函数不修改原 player 或 column", () => {
    const col = buildColumn("red", rM("m1"), rN(3, "r3"));
    const originalCards = [...col.cards];

    const columnScore = calculateColumnScore(col);
    expect(col.cards).toEqual(originalCards);
    expect(columnScore).toBeDefined();

    const player = makePlayer("p1", "Alice", {
      red: col,
      blue: emptyColumn("blue"),
      yellow: emptyColumn("yellow"),
      green: emptyColumn("green"),
      white: emptyColumn("white"),
    } as Record<CardColor, PlayerColumn>);

    const playerCardsBefore = [...player.columns["red"]!.cards];
    const playerScore = calculatePlayerScore(player);
    expect(player.columns["red"]!.cards).toEqual(playerCardsBefore);
    expect(playerScore).toBeDefined();
  });
});