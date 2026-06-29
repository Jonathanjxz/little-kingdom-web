/**
 * 游戏初始化模块 单元测试
 */

import { describe, expect, it } from "vitest";
import { CARD_COLORS } from "../../src/game/constants";
import { RULE_ERROR_CODES } from "../../src/game/errors";
import type { RandomSource } from "../../src/game/rng";
import {
  createEmptyColumns,
  createEmptyDiscardPiles,
  createInitialGameState,
  createPlayerState,
} from "../../src/game/state";
import type { CardId, PlayerId, RoomId } from "../../src/game/types";

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function pid(s: string): PlayerId {
  return s as PlayerId;
}
function rid(s: string): RoomId {
  return s as RoomId;
}

/** 始终返回 0 的随机源 */
function fixedRandom(value: number): RandomSource {
  return { next: () => value };
}

/** 收集所有手牌的 ID 集合 */
function allHandIds(state: ReturnType<typeof createInitialGameState>): Set<CardId> {
  const ids = new Set<CardId>();
  for (const p of state.players) {
    for (const c of p.hand) {
      ids.add(c.id);
    }
  }
  return ids;
}

/** 收集牌堆中所有 ID 集合 */
function deckIds(state: ReturnType<typeof createInitialGameState>): Set<CardId> {
  return new Set(state.deck.map((c) => c.id));
}

// ---------------------------------------------------------------------------
// createEmptyColumns
// ---------------------------------------------------------------------------

describe("createEmptyColumns", () => {
  it("创建 5 个颜色列", () => {
    const cols = createEmptyColumns();
    expect(Object.keys(cols)).toHaveLength(5);
    for (const color of CARD_COLORS) {
      expect(cols[color]).toBeDefined();
    }
  });

  it("每个空列颜色正确、cards 为空、statusEffects 为空", () => {
    const cols = createEmptyColumns();
    for (const color of CARD_COLORS) {
      const col = cols[color]!;
      expect(col.color).toBe(color);
      expect(col.cards).toEqual([]);
      expect(col.statusEffects).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// createEmptyDiscardPiles
// ---------------------------------------------------------------------------

describe("createEmptyDiscardPiles", () => {
  it("创建 5 个空弃牌堆", () => {
    const piles = createEmptyDiscardPiles();
    expect(Object.keys(piles)).toHaveLength(5);
    for (const color of CARD_COLORS) {
      expect(piles[color]).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// createPlayerState
// ---------------------------------------------------------------------------

describe("createPlayerState", () => {
  it("创建基础玩家状态", () => {
    const ps = createPlayerState(pid("p1"), "Alice");
    expect(ps.id).toBe("p1");
    expect(ps.nickname).toBe("Alice");
    expect(ps.hand).toEqual([]);
    expect(ps.isConnected).toBe(true);
    expect(Object.keys(ps.columns)).toHaveLength(5);
  });

  it("玩家初始额外时间为 50 秒", () => {
    const ps = createPlayerState(pid("p1"), "Alice");
    expect(ps.extraTimeRemainingSeconds).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 发牌
// ---------------------------------------------------------------------------

describe("createInitialGameState 发牌", () => {
  it("2 人初始化后每人 8 张手牌", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    expect(gs.players).toHaveLength(2);
    expect(gs.players[0]!.hand).toHaveLength(8);
    expect(gs.players[1]!.hand).toHaveLength(8);
  });

  it("3 人初始化后每人 8 张手牌", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    expect(gs.players).toHaveLength(3);
    for (const p of gs.players) {
      expect(p.hand).toHaveLength(8);
    }
  });

  it("4 人初始化后每人 8 张手牌", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
      { id: pid("p4"), nickname: "D" },
    ]);
    expect(gs.players).toHaveLength(4);
    for (const p of gs.players) {
      expect(p.hand).toHaveLength(8);
    }
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 剩余牌堆数量
// ---------------------------------------------------------------------------

describe("createInitialGameState 剩余牌堆", () => {
  it("2 人：剩余牌堆 = 60 - 16 = 44", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    expect(gs.deck).toHaveLength(44);
  });

  it("3 人：剩余牌堆 = 82 - 24 = 58", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    expect(gs.deck).toHaveLength(58);
  });

  it("4 人：剩余牌堆 = 108 - 32 = 76", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
      { id: pid("p4"), nickname: "D" },
    ]);
    expect(gs.deck).toHaveLength(76);
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 弃牌堆与牌列
// ---------------------------------------------------------------------------

describe("createInitialGameState 区域", () => {
  it("初始化后 5 个弃牌堆为空", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    for (const color of CARD_COLORS) {
      expect(gs.discardPiles[color]).toEqual([]);
    }
  });

  it("初始化后每名玩家有 5 个空颜色列", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    for (const player of gs.players) {
      expect(Object.keys(player.columns)).toHaveLength(5);
      for (const color of CARD_COLORS) {
        const col = player.columns[color]!;
        expect(col.color).toBe(color);
        expect(col.cards).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 游戏元数据
// ---------------------------------------------------------------------------

describe("createInitialGameState 元数据", () => {
  it("初始化状态为 playing", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    expect(gs.status).toBe("playing");
  });

  it("初始化阶段为 play", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    expect(gs.phase).toBe("play");
  });

  it("初始化回合数为 1", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    expect(gs.turnNumber).toBe(1);
  });

  it("当前玩家 ID 属于玩家列表", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    const playerIds = gs.players.map((p) => p.id);
    expect(playerIds).toContain(gs.currentPlayerId);
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 随机先手
// ---------------------------------------------------------------------------

describe("createInitialGameState 随机先手", () => {
  it("使用固定 RandomSource 时，先手玩家可预测", () => {
    // 使用 next() = 0.0 → Math.floor(0 * 3) = 0 → 第一个玩家先手
    const gs = createInitialGameState(
      rid("r1"),
      [
        { id: pid("p1"), nickname: "A" },
        { id: pid("p2"), nickname: "B" },
        { id: pid("p3"), nickname: "C" },
      ],
      fixedRandom(0.0),
    );
    expect(gs.currentPlayerId).toBe("p1");

    // 使用 next() = 0.5 → Math.floor(0.5 * 3) = 1 → 第二个玩家先手
    const gs2 = createInitialGameState(
      rid("r1"),
      [
        { id: pid("p1"), nickname: "A" },
        { id: pid("p2"), nickname: "B" },
        { id: pid("p3"), nickname: "C" },
      ],
      fixedRandom(0.5),
    );
    expect(gs2.currentPlayerId).toBe("p2");

    // 使用 next() = 0.999 → Math.floor(0.999 * 3) = 2 → 第三个玩家先手
    const gs3 = createInitialGameState(
      rid("r1"),
      [
        { id: pid("p1"), nickname: "A" },
        { id: pid("p2"), nickname: "B" },
        { id: pid("p3"), nickname: "C" },
      ],
      fixedRandom(0.999),
    );
    expect(gs3.currentPlayerId).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 错误处理
// ---------------------------------------------------------------------------

describe("createInitialGameState 错误处理", () => {
  it("非法玩家数 1 人抛出 INVALID_PLAYER_COUNT", () => {
    expect(() =>
      createInitialGameState(rid("r1"), [{ id: pid("p1"), nickname: "A" }]),
    ).toThrow(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
  });

  it("非法玩家数 5 人抛出 INVALID_PLAYER_COUNT", () => {
    expect(() =>
      createInitialGameState(rid("r1"), [
        { id: pid("p1"), nickname: "A" },
        { id: pid("p2"), nickname: "B" },
        { id: pid("p3"), nickname: "C" },
        { id: pid("p4"), nickname: "D" },
        { id: pid("p5"), nickname: "E" },
      ]),
    ).toThrow(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 不可变性
// ---------------------------------------------------------------------------

describe("createInitialGameState 不可变性", () => {
  it("初始化函数不修改传入玩家数组", () => {
    const players = [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ];
    const originalLen = players.length;
    createInitialGameState(rid("r1"), players);
    expect(players).toHaveLength(originalLen);
    expect(players[0]!.id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// createInitialGameState — 卡牌唯一性
// ---------------------------------------------------------------------------

describe("createInitialGameState 卡牌唯一性", () => {
  it("所有玩家手牌之间没有重复卡牌 ID", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    const handIds = allHandIds(gs);
    // 3 人 × 8 = 24 张，ID 全唯一
    expect(handIds.size).toBe(24);
  });

  it("所有玩家手牌与剩余牌堆之间没有重复卡牌 ID", () => {
    const gs = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    const handIds = allHandIds(gs);
    const remainingIds = deckIds(gs);

    // 交集为空
    for (const id of handIds) {
      expect(remainingIds.has(id)).toBe(false);
    }
  });

  it("所有卡牌总数仍等于对应人数的牌堆数量", () => {
    // 2 人
    const gs2 = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
    ]);
    const total2 = allHandIds(gs2).size + gs2.deck.length;
    expect(total2).toBe(60);

    // 3 人
    const gs3 = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
    ]);
    const total3 = allHandIds(gs3).size + gs3.deck.length;
    expect(total3).toBe(82);

    // 4 人
    const gs4 = createInitialGameState(rid("r1"), [
      { id: pid("p1"), nickname: "A" },
      { id: pid("p2"), nickname: "B" },
      { id: pid("p3"), nickname: "C" },
      { id: pid("p4"), nickname: "D" },
    ]);
    const total4 = allHandIds(gs4).size + gs4.deck.length;
    expect(total4).toBe(108);
  });
});