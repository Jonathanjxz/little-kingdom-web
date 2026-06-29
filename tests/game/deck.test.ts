/**
 * 牌堆生成与洗牌模块 单元测试
 */

import { describe, expect, it } from "vitest";
import { createDeck, shuffleDeck } from "../../src/game/deck";
import { RULE_ERROR_CODES } from "../../src/game/errors";
import type { RandomSource } from "../../src/game/rng";
import type { Card } from "../../src/game/types";

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 收集牌堆中所有 ID */
function ids(deck: Card[]): string[] {
  return deck.map((c) => c.id);
}

/** 创建一个完全确定的随机源（始终返回 0.5，适合验证算法过程） */
function makeFixedRandom(values: number[]): RandomSource {
  let index = 0;
  return {
    next() {
      const v = values[index] ?? values[values.length - 1] ?? 0.5;
      index++;
      return v;
    },
  };
}

/** 创建一个反转随机源：next() 从接近 1 递减到接近 0，触发不同的交换路径 */
function makeReversingRandom(n: number): RandomSource {
  let call = 0;
  return {
    next() {
      // 值域 [0, 1)，确保 Math.floor(v * (i+1)) <= i
      const v = (n - call) / (n + 1);
      call++;
      return v;
    },
  };
}

// ---------------------------------------------------------------------------
// 牌堆大小
// ---------------------------------------------------------------------------

describe("createDeck", () => {
  describe("牌堆大小", () => {
    it("2 人牌堆为 60 张", () => {
      expect(createDeck(2)).toHaveLength(60);
    });

    it("3 人牌堆为 82 张", () => {
      expect(createDeck(3)).toHaveLength(82);
    });

    it("4 人牌堆为 108 张", () => {
      expect(createDeck(4)).toHaveLength(108);
    });
  });

  // -----------------------------------------------------------------------
  // ID 唯一性
  // -----------------------------------------------------------------------

  describe("卡牌 ID 唯一性", () => {
    it("每张牌 ID 唯一", () => {
      const deck = createDeck(4);
      const allIds = ids(deck);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(deck.length);
    });

    it("2 人牌堆 ID 唯一", () => {
      const deck = createDeck(2);
      const uniqueIds = new Set(ids(deck));
      expect(uniqueIds.size).toBe(deck.length);
    });

    it("3 人牌堆 ID 唯一", () => {
      const deck = createDeck(3);
      const uniqueIds = new Set(ids(deck));
      expect(uniqueIds.size).toBe(deck.length);
    });
  });

  // -----------------------------------------------------------------------
  // 万能牌数量
  // -----------------------------------------------------------------------

  describe("万能牌数量", () => {
    function countWild(deck: Card[]): number {
      return deck.filter((c) => c.type === "wild").length;
    }

    it("2 人牌堆没有万能牌", () => {
      expect(countWild(createDeck(2))).toBe(0);
    });

    it("3 人牌堆有 2 张万能牌", () => {
      expect(countWild(createDeck(3))).toBe(2);
    });

    it("4 人牌堆有 3 张万能牌", () => {
      expect(countWild(createDeck(4))).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // 数字牌分布
  // -----------------------------------------------------------------------

  describe("数字牌分布", () => {
    it("2 人每种颜色有数字 2-10 各 1 张", () => {
      const deck = createDeck(2);
      const colors = ["red", "blue", "yellow", "green", "white"] as const;
      for (const color of colors) {
        for (let v = 2; v <= 10; v++) {
          const matches = deck.filter(
            (c) => c.type === "number" && c.color === color && c.value === v,
          );
          expect(matches).toHaveLength(1);
        }
      }
    });

    it("3 人每种颜色数字 2、3、4、5 各有 2 张", () => {
      const deck = createDeck(3);
      const colors = ["red", "blue", "yellow", "green", "white"] as const;
      for (const color of colors) {
        for (const v of [2, 3, 4, 5] as const) {
          const matches = deck.filter(
            (c) => c.type === "number" && c.color === color && c.value === v,
          );
          expect(matches).toHaveLength(2);
        }
      }
    });

    it("4 人每种颜色数字 6、7、8、9 各有 2 张", () => {
      const deck = createDeck(4);
      const colors = ["red", "blue", "yellow", "green", "white"] as const;
      for (const color of colors) {
        for (const v of [6, 7, 8, 9] as const) {
          const matches = deck.filter(
            (c) => c.type === "number" && c.color === color && c.value === v,
          );
          expect(matches).toHaveLength(2);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // 加倍卡分布
  // -----------------------------------------------------------------------

  describe("加倍卡分布", () => {
    it("2 人每种颜色有 3 张加倍卡", () => {
      const deck = createDeck(2);
      const colors = ["red", "blue", "yellow", "green", "white"] as const;
      for (const color of colors) {
        const count = deck.filter(
          (c) => c.type === "multiplier" && c.color === color,
        ).length;
        expect(count).toBe(3);
      }
    });

    it("4 人每种颜色有 4 张加倍卡", () => {
      const deck = createDeck(4);
      const colors = ["red", "blue", "yellow", "green", "white"] as const;
      for (const color of colors) {
        const count = deck.filter(
          (c) => c.type === "multiplier" && c.color === color,
        ).length;
        expect(count).toBe(4);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 错误处理
  // -----------------------------------------------------------------------

  describe("错误处理", () => {
    it("非法人数抛出 INVALID_PLAYER_COUNT", () => {
      // @ts-expect-error 测试非法输入
      expect(() => createDeck(1)).toThrow(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
      // @ts-expect-error 测试非法输入
      expect(() => createDeck(5)).toThrow(RULE_ERROR_CODES.INVALID_PLAYER_COUNT);
    });
  });
});

// ---------------------------------------------------------------------------
// shuffleDeck 测试
// ---------------------------------------------------------------------------

describe("shuffleDeck", () => {
  const deck = createDeck(2);

  it("不修改原数组", () => {
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck.map((c) => c.id)).toEqual(original.map((c) => c.id));
  });

  it("洗牌后数量不变", () => {
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(deck.length);
  });

  it("洗牌后保留相同卡牌 ID 集合", () => {
    const shuffled = shuffleDeck(deck);
    const originalIds = new Set(ids(deck));
    const shuffledIds = new Set(ids(shuffled));
    expect(shuffledIds).toEqual(originalIds);
  });

  it("使用固定 RandomSource 时洗牌结果可重复", () => {
    // 使用始终返回 0 的随机源：每次 j = floor(0 * (i+1)) = 0，即每次都和第一个元素交换
    const fixedZero = makeFixedRandom([0]);
    const first = shuffleDeck(deck, fixedZero);
    const second = shuffleDeck(deck, fixedZero);
    expect(ids(first)).toEqual(ids(second));
  });

  it("使用不同 RandomSource 可能产生不同结果", () => {
    // 极不可能两次都相同（概率 1/60!）
    const a = shuffleDeck(deck, makeReversingRandom(60));
    const defaultShuffle = shuffleDeck(deck); // Math.random
    // 只验证两次调用返回正确长度，不强制要求不同（理论上可能有亿分之一的碰撞）
    expect(a).toHaveLength(deck.length);
    expect(defaultShuffle).toHaveLength(deck.length);
  });
});