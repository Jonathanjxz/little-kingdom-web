/**
 * 牌列解析与放置校验模块 单元测试
 */

import { describe, expect, it } from "vitest";
import {
  canPlaceCard,
  getEvaluatedColumnCards,
  getLastEffectiveNumber,
  hasNumberInColumn,
  isColumnClosed,
  placeCardInColumn,
} from "../../src/game/column";
import { RULE_ERROR_CODES } from "../../src/game/errors";
import type {
  CardId,
  MultiplierCard,
  NumberCard,
  NumberValue,
  PlayerColumn,
  WildCard,
} from "../../src/game/types";

// ---------------------------------------------------------------------------
// 测试辅助工厂
// ---------------------------------------------------------------------------

function nid(s: string): CardId {
  return s as CardId;
}

function nCard(color: string, value: number, id: string): NumberCard {
  return {
    id: nid(id),
    type: "number",
    color: color as NumberCard["color"],
    value: value as NumberValue,
  };
}

function mCard(color: string, id: string): MultiplierCard {
  return {
    id: nid(id),
    type: "multiplier",
    color: color as MultiplierCard["color"],
  };
}

function wCard(id: string): WildCard {
  return { id: nid(id), type: "wild" };
}

function redN(value: number, id: string) {
  return nCard("red", value, id);
}
function redM(id: string) {
  return mCard("red", id);
}
function blueN(value: number, id: string) {
  return nCard("blue", value, id);
}
function blueM(id: string) {
  return mCard("blue", id);
}

function makeColumn(
  color: PlayerColumn["color"],
  cards: PlayerColumn["cards"],
): PlayerColumn {
  return { color, cards, statusEffects: [] };
}

// ---------------------------------------------------------------------------
// 辅助：利用 placeCardInColumn 逐步构建列
// ---------------------------------------------------------------------------

function buildColumn(
  color: PlayerColumn["color"],
  ...cards: (NumberCard | MultiplierCard | WildCard)[]
): PlayerColumn {
  let col = makeColumn(color, []);
  for (const c of cards) {
    col = placeCardInColumn(col, c);
  }
  return col;
}

// ---------------------------------------------------------------------------
// 空列规则
// ---------------------------------------------------------------------------

describe("空列放置", () => {
  const emptyCol = makeColumn("red", []);

  it("空列可以放对应颜色数字牌", () => {
    expect(canPlaceCard(emptyCol, redN(5, "r5"))).toBe(true);
    const result = placeCardInColumn(emptyCol, redN(5, "r5"));
    expect(result.cards).toHaveLength(1);
  });

  it("空列不能放其他颜色数字牌", () => {
    expect(canPlaceCard(emptyCol, blueN(5, "b5"))).toBe(false);
    expect(() => placeCardInColumn(emptyCol, blueN(5, "b5"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("空列可以放对应颜色加倍卡", () => {
    expect(canPlaceCard(emptyCol, redM("rm1"))).toBe(true);
    const result = placeCardInColumn(emptyCol, redM("rm1"));
    expect(result.cards).toHaveLength(1);
  });

  it("空列不能放其他颜色加倍卡", () => {
    expect(canPlaceCard(emptyCol, blueM("bm1"))).toBe(false);
    expect(() => placeCardInColumn(emptyCol, blueM("bm1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("空列可以放万能牌，且万能牌视为加倍卡", () => {
    expect(canPlaceCard(emptyCol, wCard("w1"))).toBe(true);
    const result = placeCardInColumn(emptyCol, wCard("w1"));
    expect(result.cards).toHaveLength(1);
    // 检查荒野角色
    const entry = result.cards[0] as { card: WildCard; wildRole: { type: string } };
    expect(entry.wildRole.type).toBe("multiplier");
  });
});

// ---------------------------------------------------------------------------
// 数字牌递增规则
// ---------------------------------------------------------------------------

describe("数字牌递增规则", () => {
  it("数字牌必须严格递增", () => {
    const col = buildColumn("red", redN(2, "r2"), redN(5, "r5"));
    // 8 > 5 合法
    expect(canPlaceCard(col, redN(8, "r8"))).toBe(true);
    // 3 < 5 不合法
    expect(canPlaceCard(col, redN(3, "r3"))).toBe(false);
  });

  it("数字牌允许跳号", () => {
    const col = buildColumn("red", redN(2, "r2"));
    // 8 > 2 允许跳号
    expect(canPlaceCard(col, redN(8, "r8"))).toBe(true);
    const result = placeCardInColumn(col, redN(8, "r8"));
    expect(result.cards).toHaveLength(2);
  });

  it("数字牌不允许相同数字", () => {
    const col = buildColumn("red", redN(5, "r5"));
    expect(canPlaceCard(col, redN(5, "r5b"))).toBe(false);
  });

  it("数字牌不允许更小数字", () => {
    const col = buildColumn("red", redN(5, "r5"));
    expect(canPlaceCard(col, redN(4, "r4"))).toBe(false);
    expect(canPlaceCard(col, redN(3, "r3"))).toBe(false);
    expect(canPlaceCard(col, redN(2, "r2"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 加倍卡规则
// ---------------------------------------------------------------------------

describe("加倍卡规则", () => {
  it("数字牌之后不能再放加倍卡", () => {
    const col = buildColumn("red", redN(2, "r2"));
    expect(canPlaceCard(col, redM("rm1"))).toBe(false);
    expect(() => placeCardInColumn(col, redM("rm1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("只有加倍卡的列可以继续放加倍卡", () => {
    const col = buildColumn("red", redM("rm1"), redM("rm2"));
    expect(canPlaceCard(col, redM("rm3"))).toBe(true);
    const result = placeCardInColumn(col, redM("rm3"));
    expect(result.cards).toHaveLength(3);
  });

  it("加倍卡后可以放数字牌", () => {
    const col = buildColumn("red", redM("rm1"));
    expect(canPlaceCard(col, redN(5, "r5"))).toBe(true);
    const result = placeCardInColumn(col, redN(5, "r5"));
    expect(result.cards).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 万能牌规则
// ---------------------------------------------------------------------------

describe("万能牌规则", () => {
  it("万能牌在数字前永久视为加倍卡", () => {
    // 万能牌放入空列 → 视为加倍卡
    let col = buildColumn("red", wCard("w1"));
    // 检查角色
    let evaluated = getEvaluatedColumnCards(col);
    expect(evaluated[0]!.role.type).toBe("multiplier");

    // 之后放入数字牌
    col = placeCardInColumn(col, redN(2, "r2"));
    // 万能牌仍旧是加倍卡（角色已固化）
    evaluated = getEvaluatedColumnCards(col);
    expect(evaluated[0]!.role.type).toBe("multiplier");
    expect(evaluated[1]!.role.type).toBe("number");
    expect(evaluated[1]!.effectiveValue).toBe(2);
  });

  it("万能牌在数字后视为最后有效数字 + 1", () => {
    // [2][4] + 万能牌 → 万能牌视为 5
    let col = buildColumn("red", redN(2, "r2"), redN(4, "r4"));
    col = placeCardInColumn(col, wCard("w1"));
    const evaluated = getEvaluatedColumnCards(col);
    expect(evaluated[2]!.role.type).toBe("number");
    expect(evaluated[2]!.effectiveValue).toBe(5);
  });

  it("连续万能牌可以依次 +1", () => {
    // [2][4] + 万能牌 + 万能牌 → 5, 6
    let col = buildColumn("red", redN(2, "r2"), redN(4, "r4"));
    col = placeCardInColumn(col, wCard("w1"));
    col = placeCardInColumn(col, wCard("w2"));
    const evaluated = getEvaluatedColumnCards(col);
    expect(evaluated[2]!.effectiveValue).toBe(5);
    expect(evaluated[3]!.effectiveValue).toBe(6);
  });

  it("最后有效数字为 9 时可以放万能牌，万能牌视为 10", () => {
    const col = buildColumn("red", redN(9, "r9"));
    const result = placeCardInColumn(col, wCard("w1"));
    const evaluated = getEvaluatedColumnCards(result);
    expect(evaluated[1]!.effectiveValue).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 10 封顶规则
// ---------------------------------------------------------------------------

describe("10 封顶规则", () => {
  it("最后有效数字为 10 时列关闭", () => {
    const col = buildColumn("red", redN(10, "r10"));
    expect(isColumnClosed(col)).toBe(true);
  });

  it("最后有效数字不足 10 时未关闭", () => {
    const col = buildColumn("red", redN(9, "r9"));
    expect(isColumnClosed(col)).toBe(false);
  });

  it("到达 10 后不能再放数字牌", () => {
    const col = buildColumn("red", redN(10, "r10"));
    // 已关闭，数字牌不可放
    expect(canPlaceCard(col, redN(8, "r8"))).toBe(false);
    expect(() => placeCardInColumn(col, redN(8, "r8"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("到达 10 后不能再放加倍卡", () => {
    const col = buildColumn("red", redN(10, "r10"));
    expect(canPlaceCard(col, redM("rm1"))).toBe(false);
    expect(() => placeCardInColumn(col, redM("rm1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("到达 10 后不能再放万能牌", () => {
    const col = buildColumn("red", redN(10, "r10"));
    expect(canPlaceCard(col, wCard("w1"))).toBe(false);
    expect(() => placeCardInColumn(col, wCard("w1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("万能牌到达 10 后列关闭，不能再放牌", () => {
    // 9 + 万能牌 → 万能牌视为 10，列关闭
    const col = buildColumn("red", redN(9, "r9"));
    const closed = placeCardInColumn(col, wCard("w1"));
    expect(isColumnClosed(closed)).toBe(true);
    expect(canPlaceCard(closed, redN(10, "r10-2"))).toBe(false);
    expect(canPlaceCard(closed, wCard("w2"))).toBe(false);
    expect(canPlaceCard(closed, redM("rm1"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 不可变性和错误处理
// ---------------------------------------------------------------------------

describe("不可变性和错误处理", () => {
  it("placeCardInColumn 不修改原 column", () => {
    const col = makeColumn("red", []);
    const originalCards = col.cards;
    const originalStatus = col.statusEffects;

    placeCardInColumn(col, redN(5, "r5"));

    // 原对象未被修改
    expect(col.cards).toBe(originalCards);
    expect(col.cards).toHaveLength(0);
    expect(col.statusEffects).toBe(originalStatus);
  });

  it("placeCardInColumn 非法放置时抛出 ILLEGAL_COLUMN_PLACEMENT", () => {
    const col = buildColumn("red", redN(10, "r10"));
    expect(() => placeCardInColumn(col, wCard("w1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
    expect(() => placeCardInColumn(col, redM("rm1"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
    expect(() => placeCardInColumn(col, blueN(5, "b5"))).toThrow(
      RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT,
    );
  });

  it("placeCardInColumn 保留 statusEffects", () => {
    const col: PlayerColumn = {
      color: "red",
      cards: [],
      statusEffects: [
        {
          id: "se1",
          name: "test",
          description: "a test effect",
          ownerType: "column",
          ownerId: "c1",
        },
      ],
    };
    const result = placeCardInColumn(col, redN(3, "r3"));
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects[0]!.id).toBe("se1");
    // 原对象的 statusEffects 不变
    result.statusEffects.push({
      id: "se2",
      name: "new",
      description: "",
      ownerType: "column",
      ownerId: "c1",
    });
    expect(col.statusEffects).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 辅助查询函数
// ---------------------------------------------------------------------------

describe("辅助查询函数", () => {
  it("getLastEffectiveNumber 能正确识别普通数字牌和作为数字的万能牌", () => {
    // [2][万能牌]  → 最后的有效数字是万能牌的 3
    let col = buildColumn("red", redN(2, "r2"));
    col = placeCardInColumn(col, wCard("w1"));
    expect(getLastEffectiveNumber(col)).toBe(3);

    // [2][4]  → 最后是 4
    const col2 = buildColumn("red", redN(2, "r2"), redN(4, "r4"));
    expect(getLastEffectiveNumber(col2)).toBe(4);

    // 空列
    const empty = makeColumn("red", []);
    expect(getLastEffectiveNumber(empty)).toBeUndefined();

    // 只有加倍卡
    const onlyM = buildColumn("red", redM("m1"), redM("m2"));
    expect(getLastEffectiveNumber(onlyM)).toBeUndefined();
  });

  it("hasNumberInColumn 能正确区分只有加倍卡的列和已有数字的列", () => {
    // 空列
    expect(hasNumberInColumn(makeColumn("red", []))).toBe(false);

    // 只有加倍卡
    const onlyM = buildColumn("red", redM("m1"), redM("m2"));
    expect(hasNumberInColumn(onlyM)).toBe(false);

    // 有数字牌
    const withNum = buildColumn("red", redN(2, "r2"));
    expect(hasNumberInColumn(withNum)).toBe(true);

    // 加倍卡后接数字
    const mThenNum = buildColumn("red", redM("m1"), redN(3, "r3"));
    expect(hasNumberInColumn(mThenNum)).toBe(true);

    // 只有万能牌作为加倍卡
    const wildAsM = buildColumn("red", wCard("w1"));
    expect(hasNumberInColumn(wildAsM)).toBe(false);

    // 万能牌作为数字
    let col = buildColumn("red", redN(2, "r2"));
    col = placeCardInColumn(col, wCard("w1")); // 视为 3
    expect(hasNumberInColumn(col)).toBe(true);
  });

  it("isColumnClosed 在最后有效数字为 10 时返回 true", () => {
    // 普通 10
    expect(isColumnClosed(buildColumn("red", redN(10, "r10")))).toBe(true);

    // 万能牌视为 10
    let col = buildColumn("red", redN(9, "r9"));
    col = placeCardInColumn(col, wCard("w1")); // 视为 10
    expect(isColumnClosed(col)).toBe(true);

    // 未关闭
    expect(isColumnClosed(buildColumn("red", redN(9, "r9")))).toBe(false);
    expect(isColumnClosed(makeColumn("red", []))).toBe(false);
    expect(isColumnClosed(buildColumn("red", redM("m1")))).toBe(false);
  });
});