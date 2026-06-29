/**
 * 玩家视角 DTO 单元测试
 */

import { describe, expect, it } from "vitest";
import {
  discardCard,
  drawFromDeck,
  drawFromDiscard,
  placeCardToColumn,
} from "../../src/game/actions";
import { RULE_ERROR_CODES } from "../../src/game/errors";
import { createPlayerGameView } from "../../src/game/view";
import type {
  Card,
  CardId,
  GameState,
  NumberCard,
  NumberValue,
  PlayerId,
  RoomId,
} from "../../src/game/types";

// ---------------------------------------------------------------------------
// 辅助
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
function rN(value: number, id: string): NumberCard {
  return {
    id: cid(id),
    type: "number",
    color: "red",
    value: value as NumberValue,
  };
}

/** 创建一个自定义的 GameState，含 2 名玩家 */
function makeState(): GameState {
  const p1 = pid("p1");
  const p2 = pid("p2");
  const emptyRedCol = { color: "red" as const, cards: [], statusEffects: [], };
  const emptyBlueCol = { color: "blue" as const, cards: [], statusEffects: [], };
  const emptyYellowCol = { color: "yellow" as const, cards: [], statusEffects: [], };
  const emptyGreenCol = { color: "green" as const, cards: [], statusEffects: [], };
  const emptyWhiteCol = { color: "white" as const, cards: [], statusEffects: [], };

  return {
    roomId: rid("r1"),
    status: "playing",
    phase: "play",
    players: [
      {
        id: p1,
        nickname: "Alice",
        hand: [rN(5, "r5")],
        columns: {
          red: emptyRedCol,
          blue: emptyBlueCol,
          yellow: emptyYellowCol,
          green: emptyGreenCol,
          white: emptyWhiteCol,
        },
        statusEffects: [],
        isConnected: true,
        extraTimeRemainingSeconds: 50,
      },
      {
        id: p2,
        nickname: "Bob",
        hand: [rN(3, "r3"), rN(8, "r8")],
        columns: {
          red: emptyRedCol,
          blue: emptyBlueCol,
          yellow: emptyYellowCol,
          green: emptyGreenCol,
          white: emptyWhiteCol,
        },
        statusEffects: [],
        isConnected: true,
        extraTimeRemainingSeconds: 50,
      },
    ],
    currentPlayerId: p1,
    turnNumber: 1,
    deck: [rN(9, "deck9"), rN(10, "deck10")],
    discardPiles: {
      red: [] as Card[],
      blue: [] as Card[],
      yellow: [] as Card[],
      green: [] as Card[],
      white: [] as Card[],
    },
    lastDiscardedThisTurn: undefined,
    operationStartedAt: undefined,
    statusEffects: [],
    events: [],
    finalResult: undefined,
  };
}

// ---------------------------------------------------------------------------
// 基本视图
// ---------------------------------------------------------------------------

describe("createPlayerGameView", () => {
  it("viewer 可以看到自己的完整手牌", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    expect(view.self.hand).toHaveLength(1);
    expect(view.self.hand[0]!.id).toBe(cid("r5"));
  });

  it("viewer 看不到其他玩家完整手牌，只能看到 handCount", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    const bobView = view.players.find((p) => p.id === pid("p2"))!;
    // PublicPlayerView 无 hand 属性
    expect("hand" in bobView).toBe(false);
    expect(bobView.handCount).toBe(2);
  });

  it("view 中没有 deck 字段", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    // PlayerGameView 没有 deck 属性
    expect("deck" in view).toBe(false);
  });

  it("view 中只有 deckCount", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    expect(view.deckCount).toBe(2);
  });

  it("deckCount 等于权威状态中的 state.deck.length", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    expect(view.deckCount).toBe(state.deck.length);
  });

  it("view 中包含公开弃牌堆", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    expect(view.discardPiles).toBe(state.discardPiles);
    expect(view.discardPiles["red"]).toEqual([]);
  });

  it("view 中包含公开玩家牌列", () => {
    const state = makeState();
    const view = createPlayerGameView(state, pid("p1"));
    const p2View = view.players.find((p) => p.id === pid("p2"))!;
    expect(p2View.columns["red"]).toBeDefined();
    expect(p2View.columns["red"]!.cards).toEqual([]);
  });

  it("viewerId 不存在时抛出 NOT_CURRENT_PLAYER", () => {
    const state = makeState();
    expect(() =>
      createPlayerGameView(state, pid("nonexistent")),
    ).toThrow(RULE_ERROR_CODES.NOT_CURRENT_PLAYER);
  });

  it("从牌堆摸牌后的事件不暴露 cardId", () => {
    const state = makeState();
    // P1 放牌进入 draw 阶段
    const afterPlay = placeCardToColumn(state, pid("p1"), cid("r5"), "red").state;
    const afterDraw = drawFromDeck(afterPlay, pid("p1"));
    const view = createPlayerGameView(afterDraw.state, pid("p1"));
    const deckDrawEvents = view.events.filter(
      (e) => e.type === "CARD_DRAWN_FROM_DECK",
    );
    for (const e of deckDrawEvents) {
      // CARD_DRAWN_FROM_DECK 事件不应包含 cardId
      expect("cardId" in e).toBe(false);
    }
  });

  it("从弃牌堆摸牌后的事件可以暴露 cardId", () => {
    // 构造：P1 弃牌 → P1 摸牌推进 → P2 进入 draw → P2 摸 P1 弃的牌
    const state = makeState();
    const p1 = pid("p1");
    // 给牌堆加牌以确保有牌可摸
    const withExtraDeck: GameState = {
      ...state,
      deck: [...state.deck, rN(10, "deck10b")],
    };
    const afterDiscard = discardCard(withExtraDeck, p1, cid("r5")).state;
    const afterDraw = drawFromDeck(afterDiscard, p1).state;
    const p2 = pid("p2");
    const p2Player = afterDraw.players.find((p) => p.id === p2)!;
    const p2Card = p2Player.hand[0]!;
    // p2Card 一定是数字牌（因为我们构造时只放了数字牌）
    const p2Color = p2Card.type === "wild" ? ("red" as const) : p2Card.color;
    const afterP2Play = placeCardToColumn(afterDraw, p2, p2Card.id, p2Color).state;
    const afterP2Draw = drawFromDiscard(afterP2Play, p2, "red");
    const view = createPlayerGameView(afterP2Draw.state, p2);
    const discardDrawEvents = view.events.filter(
      (e) => e.type === "CARD_DRAWN_FROM_DISCARD",
    );
    const lastEvent = discardDrawEvents[discardDrawEvents.length - 1];
    expect(lastEvent).toBeDefined();
    if (lastEvent?.type === "CARD_DRAWN_FROM_DISCARD") {
      expect(lastEvent.cardId).toBe(cid("r5"));
    }
  });
});