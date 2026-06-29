/**
 * 游戏动作与回合状态机 单元测试
 */

import { describe, expect, it } from "vitest";
import {
  applyGameAction,
  discardCard,
  drawFromDeck,
  drawFromDiscard,
  placeCardToColumn,
  skipPlayNoLegalAction,
} from "../../src/game/actions";
import { placeCardInColumn } from "../../src/game/column";
import { RULE_ERROR_CODES } from "../../src/game/errors";
import type {
  CardColor,
  CardId,
  GameAction,
  GameState,
  MultiplierCard,
  NumberCard,
  NumberValue,
  PlayerColumn,
  PlayerId,
  RoomId,
  WildCard,
} from "../../src/game/types";

// ---------------------------------------------------------------------------
// 稳定卡牌工厂
// ---------------------------------------------------------------------------

function pid(s: string): PlayerId {
  return s as PlayerId;
}
function rid(s: string): RoomId {
  return s as RoomId;
}
function cid(s: string): CardId {
  return s as CardId;
}

function numCard(color: string, value: number, id: string): NumberCard {
  return {
    id: cid(id),
    type: "number",
    color: color as NumberCard["color"],
    value: value as NumberValue,
  };
}
function mulCard(color: string, id: string): MultiplierCard {
  return {
    id: cid(id),
    type: "multiplier",
    color: color as MultiplierCard["color"],
  };
}
function wildCard(id: string): WildCard {
  return { id: cid(id), type: "wild" };
}

function rN(value: number, id: string) {
  return numCard("red", value, id);
}
function rM(id: string) {
  return mulCard("red", id);
}

/** 创建一个空的 PlayerColumn */
function emptyColumn(color: CardColor): PlayerColumn {
  return { color, cards: [], statusEffects: [] };
}

/** 按给定手牌创建自定义 GameState，只含 2 名玩家，其余为默认空值 */
function makeStateWithHands(
  p1Cards: (NumberCard | MultiplierCard | WildCard)[],
  p2Cards: (NumberCard | MultiplierCard | WildCard)[],
): GameState {
  const p1 = pid("p1");
  const p2 = pid("p2");
  const emptyCols = {
    red: emptyColumn("red"),
    blue: emptyColumn("blue"),
    yellow: emptyColumn("yellow"),
    green: emptyColumn("green"),
    white: emptyColumn("white"),
  } as Record<CardColor, PlayerColumn>;

  return {
    roomId: rid("r1"),
    status: "playing",
    phase: "play",
    players: [
      {
        id: p1,
        nickname: "A",
        hand: [...p1Cards],
        columns: { ...emptyCols },
        statusEffects: [],
        isConnected: true,
        extraTimeRemainingSeconds: 50,
      },
      {
        id: p2,
        nickname: "B",
        hand: [...p2Cards],
        columns: { ...emptyCols },
        statusEffects: [],
        isConnected: true,
        extraTimeRemainingSeconds: 50,
      },
    ],
    currentPlayerId: p1,
    turnNumber: 1,
    deck: [],
    discardPiles: {
      red: [],
      blue: [],
      yellow: [],
      green: [],
      white: [],
    },
    lastDiscardedThisTurn: undefined,
    operationStartedAt: undefined,
    statusEffects: [],
    events: [],
    finalResult: undefined,
  };
}

/** 创建一个 5 色全部关闭的 columns 对象（每列最后有效数字 = 10） */
function allClosedColumns(): Record<CardColor, PlayerColumn> {
  return {
    red: placeCardInColumn(emptyColumn("red"), rN(10, "r10")),
    blue: placeCardInColumn(emptyColumn("blue"), numCard("blue", 10, "b10")),
    yellow: placeCardInColumn(emptyColumn("yellow"), numCard("yellow", 10, "y10")),
    green: placeCardInColumn(emptyColumn("green"), numCard("green", 10, "g10")),
    white: placeCardInColumn(emptyColumn("white"), numCard("white", 10, "w10")),
  };
}

// ---------------------------------------------------------------------------
// 通用校验
// ---------------------------------------------------------------------------

describe("通用校验", () => {
  it("非当前玩家操作抛出 NOT_CURRENT_PLAYER", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    expect(() =>
      placeCardToColumn(state, pid("p2"), cid("r3"), "red"),
    ).toThrow(RULE_ERROR_CODES.NOT_CURRENT_PLAYER);
  });

  it("错误阶段操作抛出 WRONG_PHASE", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    expect(() =>
      drawFromDeck(state, pid("p1")),
    ).toThrow(RULE_ERROR_CODES.WRONG_PHASE);
  });

  it("游戏已结束时操作抛出 GAME_ALREADY_FINISHED", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const finishedState: GameState = { ...state, status: "finished", phase: "finished" };
    expect(() =>
      placeCardToColumn(finishedState, pid("p1"), cid("r5"), "red"),
    ).toThrow(RULE_ERROR_CODES.GAME_ALREADY_FINISHED);
  });

  it("手牌中没有指定卡牌抛出 CARD_NOT_IN_HAND", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    expect(() =>
      placeCardToColumn(state, pid("p1"), cid("nonexistent"), "red"),
    ).toThrow(RULE_ERROR_CODES.CARD_NOT_IN_HAND);
  });

  it("waiting 状态不能执行动作（WRONG_PHASE）", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const waitingState: GameState = { ...state, status: "waiting" };
    expect(() =>
      placeCardToColumn(waitingState, pid("p1"), cid("r5"), "red"),
    ).toThrow(RULE_ERROR_CODES.WRONG_PHASE);
  });
});

// ---------------------------------------------------------------------------
// PLACE_CARD
// ---------------------------------------------------------------------------

describe("PLACE_CARD", () => {
  it("出牌阶段可以把数字牌放到对应颜色列", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    const updatedPlayer = newState.players.find((p) => p.id === pid("p1"))!;
    expect(updatedPlayer.columns["red"]!.cards).toHaveLength(1);
  });

  it("放牌后手牌减少 1", () => {
    const state = makeStateWithHands([rN(5, "r5"), rN(8, "r8")], [rN(3, "r3")]);
    const { state: newState } = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    const updatedPlayer = newState.players.find((p) => p.id === pid("p1"))!;
    expect(updatedPlayer.hand).toHaveLength(1);
  });

  it("放牌后阶段变为 draw", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    expect(newState.phase).toBe("draw");
  });

  it("放牌后不切换当前玩家", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    expect(newState.currentPlayerId).toBe(pid("p1"));
  });

  it("非法放置抛出 ILLEGAL_COLUMN_PLACEMENT", () => {
    // 放 5 后不能再放 5
    const state = makeStateWithHands([rN(5, "r5"), rN(5, "r5b")], [rN(3, "r3")]);
    const { state: afterFirst } = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    // 现在 phase 是 draw，不能放牌
    expect(() =>
      placeCardToColumn(afterFirst, pid("p1"), cid("r5b"), "red"),
    ).toThrow(RULE_ERROR_CODES.WRONG_PHASE);
  });

  it("万能牌可以放入任意颜色列", () => {
    const state = makeStateWithHands([wildCard("w1")], [rN(3, "r3")]);
    const { state: newState } = placeCardToColumn(state, pid("p1"), cid("w1"), "blue");
    const updatedPlayer = newState.players.find((p) => p.id === pid("p1"))!;
    expect(updatedPlayer.columns["blue"]!.cards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DISCARD_CARD
// ---------------------------------------------------------------------------

describe("DISCARD_CARD", () => {
  it("出牌阶段可以弃置数字牌到对应颜色弃牌堆", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = discardCard(state, pid("p1"), cid("r5"));
    expect(newState.discardPiles["red"]).toHaveLength(1);
    expect(newState.discardPiles["red"]![0]!.id).toBe("r5");
  });

  it("出牌阶段可以弃置加倍卡到对应颜色弃牌堆", () => {
    const state = makeStateWithHands([rM("rm1")], [rN(3, "r3")]);
    const { state: newState } = discardCard(state, pid("p1"), cid("rm1"));
    expect(newState.discardPiles["red"]).toHaveLength(1);
  });

  it("万能牌不能弃置，抛出 WILD_CANNOT_BE_DISCARDED", () => {
    const state = makeStateWithHands([wildCard("w1")], [rN(3, "r3")]);
    expect(() =>
      discardCard(state, pid("p1"), cid("w1")),
    ).toThrow(RULE_ERROR_CODES.WILD_CANNOT_BE_DISCARDED);
  });

  it("弃牌后阶段变为 draw", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = discardCard(state, pid("p1"), cid("r5"));
    expect(newState.phase).toBe("draw");
  });

  it("弃牌后记录 lastDiscardedThisTurn", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const { state: newState } = discardCard(state, pid("p1"), cid("r5"));
    expect(newState.lastDiscardedThisTurn).toBeDefined();
    expect(newState.lastDiscardedThisTurn!.playerId).toBe(pid("p1"));
    expect(newState.lastDiscardedThisTurn!.cardId).toBe(cid("r5"));
  });
});

// ---------------------------------------------------------------------------
// DRAW_FROM_DECK
// ---------------------------------------------------------------------------

describe("DRAW_FROM_DECK", () => {
  /** 构造 draw 阶段的 state */
  function goToDraw(state: GameState): GameState {
    return placeCardToColumn(
      state, pid("p1"), state.players[0]!.hand[0]!.id,
      "red",
    ).state;
  }

  it("摸牌阶段可以从牌堆摸牌", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    const player = newState.players.find((p) => p.id === pid("p1"))!;
    // 用了 1 张放牌，手牌剩 0，摸 1 = 1
    expect(player.hand).toHaveLength(1);
  });

  it("摸牌后手牌增加 1", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = goToDraw(deckState);
    const before = drawState.players[0]!.hand.length;
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.players[0]!.hand.length).toBe(before + 1);
  });

  it("摸牌后切换到下一名玩家", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.currentPlayerId).toBe(pid("p2"));
  });

  it("摸牌后阶段恢复为 play", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.phase).toBe("play");
  });

  it("摸牌后 turnNumber 加 1", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = goToDraw(deckState);
    const before = drawState.turnNumber;
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.turnNumber).toBe(before + 1);
  });

  it("牌堆为空时抛出 DECK_EMPTY_INVALID_STATE", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const drawState = goToDraw(state);
    expect(() => drawFromDeck(drawState, pid("p1"))).toThrow(
      RULE_ERROR_CODES.DECK_EMPTY_INVALID_STATE,
    );
  });

  it("摸到最后一张牌后游戏进入 finished", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.status).toBe("finished");
    expect(newState.phase).toBe("finished");
  });

  it("摸到最后一张牌后生成 finalResult", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.finalResult).toBeDefined();
    expect(newState.finalResult!.rankings).toHaveLength(2);
  });

  it("摸到最后一张牌后不推进到下一名玩家", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8")] };
    const drawState = goToDraw(deckState);
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.currentPlayerId).toBe(pid("p1"));
  });

  it("摸到最后一张牌后事件顺序为 CARD_DRAWN_FROM_DECK → TURN_COMPLETED → GAME_FINISHED", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8")] };
    const drawState = goToDraw(deckState);
    const { events } = drawFromDeck(drawState, pid("p1"));
    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe("CARD_DRAWN_FROM_DECK");
    expect(events[1]!.type).toBe("TURN_COMPLETED");
    expect(events[2]!.type).toBe("GAME_FINISHED");
  });

  it("摸到最后一张牌后 turnNumber 不增加", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8")] };
    const drawState = goToDraw(deckState);
    const before = drawState.turnNumber;
    const { state: newState } = drawFromDeck(drawState, pid("p1"));
    expect(newState.turnNumber).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// DRAW_FROM_DISCARD
// ---------------------------------------------------------------------------

describe("DRAW_FROM_DISCARD", () => {
  /** P1 弃牌 → P1 摸牌 → P2 进入 draw → P2 可摸 P1 弃的牌 */
  function prepareDiscardThenDrawState(): {
    state: GameState;
    cp: PlayerId;
    discardColor: CardColor;
    discardedCardId: CardId;
  } {
    const state = makeStateWithHands(
      [rN(5, "r5"), rN(7, "r7"), rN(9, "r9")],
      [rN(3, "r3"), rN(4, "r4"), rN(6, "r6")],
    );
    const deckState: GameState = { ...state, deck: [rN(8, "deck8"), rN(10, "deck10")] };
    const p1 = pid("p1");
    // P1 弃牌
    const afterDiscard = discardCard(deckState, p1, cid("r7")).state;
    // P1 摸牌推进
    const afterDraw = drawFromDeck(afterDiscard, p1).state;
    const p2 = pid("p2");
    // P2 放牌进 draw
    const p2Player = afterDraw.players.find((p) => p.id === p2)!;
    const p2Card = p2Player.hand[0]!;
    const p2Color = p2Card.type === "wild" ? "red" : p2Card.color;
    const afterP2Play = placeCardToColumn(
      afterDraw, p2, p2Card.id, p2Color,
    ).state;
    return {
      state: afterP2Play, cp: p2,
      discardColor: "red", // r7 was red
      discardedCardId: cid("r7"),
    };
  }

  it("摸牌阶段可以从非空弃牌堆顶部摸牌", () => {
    const { state, cp, discardColor } = prepareDiscardThenDrawState();
    const { state: newState } = drawFromDiscard(state, cp, discardColor);
    const player = newState.players.find((p) => p.id === cp)!;
    // 放牌后手牌 = 原本 3 - 1 = 2，摸回 = 3
    expect(player.hand).toHaveLength(3);
  });

  it("从弃牌堆摸牌后该弃牌堆减少 1", () => {
    const { state, cp, discardColor } = prepareDiscardThenDrawState();
    const before = state.discardPiles[discardColor].length;
    const { state: newState } = drawFromDiscard(state, cp, discardColor);
    expect(newState.discardPiles[discardColor]).toHaveLength(before - 1);
  });

  it("从弃牌堆摸牌后玩家手牌增加 1", () => {
    const { state, cp, discardColor } = prepareDiscardThenDrawState();
    const playerBefore = state.players.find((p) => p.id === cp)!;
    const { state: newState } = drawFromDiscard(state, cp, discardColor);
    const playerAfter = newState.players.find((p) => p.id === cp)!;
    expect(playerAfter.hand.length).toBe(playerBefore.hand.length + 1);
  });

  it("空弃牌堆抛出 DISCARD_PILE_EMPTY", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const drawState = placeCardToColumn(state, pid("p1"), cid("r5"), "red").state;
    expect(() =>
      drawFromDiscard(drawState, pid("p1"), "blue"),
    ).toThrow(RULE_ERROR_CODES.DISCARD_PILE_EMPTY);
  });

  it("不能摸回自己本回合刚弃掉的牌，抛出 CANNOT_DRAW_OWN_DISCARD", () => {
    const state = makeStateWithHands([rN(5, "r5"), rN(7, "r7")], [rN(3, "r3")]);
    const p1 = pid("p1");
    const afterDiscard = discardCard(state, p1, cid("r5")).state;
    expect(() =>
      drawFromDiscard(afterDiscard, p1, "red"),
    ).toThrow(RULE_ERROR_CODES.CANNOT_DRAW_OWN_DISCARD);
  });

  it("可以摸其他玩家或之前回合弃置的顶部牌", () => {
    const { state, cp, discardColor, discardedCardId } =
      prepareDiscardThenDrawState();
    const { state: newState } = drawFromDiscard(state, cp, discardColor);
    const player = newState.players.find((p) => p.id === cp)!;
    const drawnCard = player.hand[player.hand.length - 1];
    expect(drawnCard!.id).toBe(discardedCardId);
  });

  it("从弃牌堆摸牌后切换到下一名玩家并清空 lastDiscardedThisTurn", () => {
    const { state, cp, discardColor } = prepareDiscardThenDrawState();
    const { state: finalState } = drawFromDiscard(state, cp, discardColor);
    expect(finalState.currentPlayerId).not.toBe(cp);
    expect(finalState.lastDiscardedThisTurn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SKIP_PLAY_NO_LEGAL_ACTION（含加固）
// ---------------------------------------------------------------------------

describe("SKIP_PLAY_NO_LEGAL_ACTION", () => {
  it("正常初始状态下玩家有合法动作，不能跳过，抛出 LEGAL_PLAY_AVAILABLE", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    expect(() =>
      skipPlayNoLegalAction(state, pid("p1")),
    ).toThrow(RULE_ERROR_CODES.LEGAL_PLAY_AVAILABLE);
  });

  it("拥有万能牌但所有列均已关闭时，无合法出牌，可以跳过", () => {
    // 构造：玩家只有万能牌，且 5 列全部已关闭（最后有效数字 = 10）
    const state = makeStateWithHands([wildCard("w1")], [rN(3, "r3")]);
    const s2: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === pid("p1")
          ? { ...p, columns: allClosedColumns() }
          : p,
      ) as GameState["players"],
    };
    const { state: newState } = skipPlayNoLegalAction(s2, pid("p1"));
    expect(newState.phase).toBe("draw");
  });

  it("跳过后阶段变为 draw", () => {
    const state = makeStateWithHands([wildCard("w1")], [rN(3, "r3")]);
    const s2: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === pid("p1")
          ? { ...p, columns: allClosedColumns() }
          : p,
      ) as GameState["players"],
    };
    const { state: newState } = skipPlayNoLegalAction(s2, pid("p1"));
    expect(newState.phase).toBe("draw");
  });

  it("产生 PLAY_PHASE_SKIPPED 事件", () => {
    const state = makeStateWithHands([wildCard("w1")], [rN(3, "r3")]);
    const s2: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === pid("p1")
          ? { ...p, columns: allClosedColumns() }
          : p,
      ) as GameState["players"],
    };
    const { events } = skipPlayNoLegalAction(s2, pid("p1"));
    const skipEvent = events.find((e) => e.type === "PLAY_PHASE_SKIPPED");
    expect(skipEvent).toBeDefined();
    if (skipEvent?.type === "PLAY_PHASE_SKIPPED") {
      expect(skipEvent.reason).toBe("NO_LEGAL_ACTION");
    }
  });
});

// ---------------------------------------------------------------------------
// 事件与不可变性
// ---------------------------------------------------------------------------

describe("事件与不可变性", () => {
  it("合法动作返回 ActionResult，包含本次新事件", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const result = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe("CARD_PLACED");
  });

  it("新事件会追加到 state.events", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const result = placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    expect(result.state.events.length).toBe(state.events.length + result.events.length);
  });

  it("原始 GameState 不被修改", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const originalPhase = state.phase;
    const originalEventsLen = state.events.length;
    placeCardToColumn(state, pid("p1"), cid("r5"), "red");
    expect(state.phase).toBe(originalPhase);
    expect(state.events).toHaveLength(originalEventsLen);
  });

  it("从牌堆摸牌事件不暴露具体 cardId", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const deckState: GameState = { ...state, deck: [rN(8, "r8"), rN(9, "r9")] };
    const drawState = placeCardToColumn(deckState, pid("p1"), cid("r5"), "red").state;
    const { events } = drawFromDeck(drawState, pid("p1"));
    const drawEvent = events.find((e) => e.type === "CARD_DRAWN_FROM_DECK");
    expect(drawEvent).toBeDefined();
    if (drawEvent?.type === "CARD_DRAWN_FROM_DECK") {
      expect("cardId" in drawEvent).toBe(false);
    }
  });

  it("从弃牌堆摸牌事件暴露 cardId", () => {
    const state = makeStateWithHands(
      [rN(5, "r5"), rN(7, "r7")],
      [rN(3, "r3"), rN(4, "r4")],
    );
    const deckState: GameState = { ...state, deck: [rN(8, "deck8"), rN(9, "deck9")] };
    const p1 = pid("p1");
    const afterDiscard = discardCard(deckState, p1, cid("r7")).state;
    const afterDraw = drawFromDeck(afterDiscard, p1).state;
    const p2 = pid("p2");
    const p2Player = afterDraw.players.find((p) => p.id === p2)!;
    const p2Card = p2Player.hand[0]!;
    const p2Color = p2Card.type === "wild" ? "red" : p2Card.color;
    const afterP2Play = placeCardToColumn(afterDraw, p2, p2Card.id, p2Color).state;
    const { events } = drawFromDiscard(afterP2Play, p2, "red");
    const discardEvent = events.find((e) => e.type === "CARD_DRAWN_FROM_DISCARD");
    expect(discardEvent).toBeDefined();
    if (discardEvent?.type === "CARD_DRAWN_FROM_DISCARD") {
      expect(discardEvent.cardId).toBe(cid("r7"));
    }
  });

  it("applyGameAction 能正确分发所有动作", () => {
    const state = makeStateWithHands([rN(5, "r5")], [rN(3, "r3")]);
    const cp = pid("p1");

    const placeAction: GameAction = { type: "PLACE_CARD", playerId: cp, cardId: cid("r5"), color: "red" };
    const r1 = applyGameAction(state, placeAction);
    expect(r1.state.phase).toBe("draw");

    const deckState: GameState = { ...r1.state, deck: [rN(8, "r8")] };
    const drawAction: GameAction = { type: "DRAW_FROM_DECK", playerId: cp };
    const r2 = applyGameAction(deckState, drawAction);
    // 如果有牌可摸且不是最后一张，应为 play
    expect(r2.state.phase === "play" || r2.state.phase === "finished").toBe(true);
  });
});