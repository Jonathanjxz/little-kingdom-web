/**
 * 游戏动作与回合状态机
 *
 * 提供所有玩家动作的不可变实现：
 * - 放牌到颜色列
 * - 弃牌到弃牌堆
 * - 从牌堆摸牌（含牌堆耗尽结束判定）
 * - 从弃牌堆摸牌
 * - 跳过出牌（含合法动作检测）
 * - applyGameAction 统一分发
 *
 * 所有操作不修改原 GameState，返回新的 state 与新增事件。
 */

import { placeCardInColumn } from "./column";
import { RULE_ERROR_CODES, RuleError } from "./errors";
import { calculateFinalResult } from "./scoring";
import { hasAnyLegalPlay } from "./selectors";
import type {
  Card,
  CardColor,
  GameAction,
  GameEvent,
  GamePhase,
  GameState,
  PlayerColumn,
  PlayerId,
} from "./types";

// ---------------------------------------------------------------------------
// 公开类型
// ---------------------------------------------------------------------------

/** 动作执行的可选时戳 */
export interface ActionOptions {
  /** 事件 occurredAt 时间戳，默认 0（保持测试可重复） */
  now?: number;
}

/** 动作执行结果 */
export interface ActionResult {
  /** 新的游戏状态（不可变） */
  state: GameState;
  /** 本次动作产生的新事件 */
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 在 state 中查找玩家并返回其索引 */
function findPlayerIndex(state: GameState, playerId: PlayerId): number {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) {
    throw new RuleError(RULE_ERROR_CODES.NOT_CURRENT_PLAYER);
  }
  return idx;
}

/** 从玩家手牌中查找并移除一张牌，返回 [新hand, 该牌] */
function removeFromHand(
  hand: Card[],
  cardId: Card["id"],
): [Card[], Card] {
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    throw new RuleError(RULE_ERROR_CODES.CARD_NOT_IN_HAND);
  }
  const card = hand[idx]!;
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  return [newHand, card];
}

/** 生成下一个事件 ID */
function nextEventId(state: GameState, localIndex: number): string {
  return `event-${state.events.length + localIndex + 1}`;
}

/** 生成事件的时间戳 */
function eventOccurredAt(options?: ActionOptions): number {
  return options?.now ?? 0;
}

// ---------------------------------------------------------------------------
// 通用校验
// ---------------------------------------------------------------------------

function assertIsPlaying(state: GameState): void {
  if (state.status === "finished" || state.phase === "finished") {
    throw new RuleError(RULE_ERROR_CODES.GAME_ALREADY_FINISHED);
  }
  if (state.status !== "playing") {
    throw new RuleError(RULE_ERROR_CODES.WRONG_PHASE);
  }
}

function assertCurrentPlayer(
  state: GameState,
  playerId: PlayerId,
): void {
  if (state.currentPlayerId !== playerId) {
    throw new RuleError(RULE_ERROR_CODES.NOT_CURRENT_PLAYER);
  }
}

function assertPhase(state: GameState, expected: GamePhase): void {
  if (state.phase !== expected) {
    throw new RuleError(RULE_ERROR_CODES.WRONG_PHASE);
  }
}

/** 深拷贝 players 数组 */
function clonePlayers(state: GameState): GameState["players"] {
  return state.players.map((p) => ({ ...p, hand: [...p.hand] }));
}

// ---------------------------------------------------------------------------
// 回合推进
// ---------------------------------------------------------------------------

/** 找到当前玩家的下一个玩家 ID（按 players 顺序循环） */
function nextPlayerId(state: GameState): PlayerId {
  const idx = findPlayerIndex(state, state.currentPlayerId!);
  const nextIdx = (idx + 1) % state.players.length;
  return state.players[nextIdx]!.id;
}

/**
 * 摸牌后推进回合（非牌堆耗尽情况）。
 * 切换玩家、阶段恢复 play、turnNumber+1、清空 lastDiscardedThisTurn、
 * 追加 TURN_COMPLETED 事件。
 */
function advanceTurn(
  state: GameState,
  completedPlayerId: PlayerId,
  options?: ActionOptions,
): GameState {
  const now = eventOccurredAt(options);
  const turnEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "TURN_COMPLETED",
    playerId: completedPlayerId,
  };

  return {
    ...state,
    phase: "play",
    currentPlayerId: nextPlayerId(state),
    turnNumber: state.turnNumber + 1,
    lastDiscardedThisTurn: undefined,
    events: [...state.events, turnEvent],
  };
}

// ---------------------------------------------------------------------------
// 1. 放牌到颜色列
// ---------------------------------------------------------------------------

export function placeCardToColumn(
  state: GameState,
  playerId: PlayerId,
  cardId: Card["id"],
  color: CardColor,
  options?: ActionOptions,
): ActionResult {
  assertIsPlaying(state);
  assertCurrentPlayer(state, playerId);
  assertPhase(state, "play");

  const playerIdx = findPlayerIndex(state, playerId);
  const player = state.players[playerIdx]!;

  const [newHand, card] = removeFromHand(player.hand, cardId);
  const column = player.columns[color]!;

  let newColumn: PlayerColumn;
  try {
    newColumn = placeCardInColumn(column, card);
  } catch (err) {
    if (err instanceof RuleError) throw err;
    throw new RuleError(RULE_ERROR_CODES.ILLEGAL_COLUMN_PLACEMENT);
  }

  const now = eventOccurredAt(options);
  const placedEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "CARD_PLACED",
    playerId,
    cardId,
    color,
  };

  const newPlayers = clonePlayers(state);
  newPlayers[playerIdx] = {
    ...newPlayers[playerIdx]!,
    hand: newHand,
    columns: { ...player.columns, [color]: newColumn },
  };

  return {
    state: {
      ...state,
      phase: "draw",
      players: newPlayers,
      events: [...state.events, placedEvent],
    },
    events: [placedEvent],
  };
}

// ---------------------------------------------------------------------------
// 2. 弃牌到弃牌堆
// ---------------------------------------------------------------------------

export function discardCard(
  state: GameState,
  playerId: PlayerId,
  cardId: Card["id"],
  options?: ActionOptions,
): ActionResult {
  assertIsPlaying(state);
  assertCurrentPlayer(state, playerId);
  assertPhase(state, "play");

  const playerIdx = findPlayerIndex(state, playerId);
  const player = state.players[playerIdx]!;

  const [newHand, card] = removeFromHand(player.hand, cardId);

  // 万能牌不能弃置
  if (card.type === "wild") {
    throw new RuleError(RULE_ERROR_CODES.WILD_CANNOT_BE_DISCARDED);
  }

  const discardColor = card.color;
  const newDiscardPile = [
    ...state.discardPiles[discardColor],
    card,
  ];

  const now = eventOccurredAt(options);
  const discardEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "CARD_DISCARDED",
    playerId,
    cardId,
    color: discardColor,
  };

  const newPlayers = clonePlayers(state);
  newPlayers[playerIdx] = {
    ...newPlayers[playerIdx]!,
    hand: newHand,
  };

  return {
    state: {
      ...state,
      phase: "draw",
      players: newPlayers,
      discardPiles: {
        ...state.discardPiles,
        [discardColor]: newDiscardPile,
      },
      lastDiscardedThisTurn: {
        playerId,
        cardId,
        color: discardColor,
      },
      events: [...state.events, discardEvent],
    },
    events: [discardEvent],
  };
}

// ---------------------------------------------------------------------------
// 3. 从牌堆摸牌
// ---------------------------------------------------------------------------

export function drawFromDeck(
  state: GameState,
  playerId: PlayerId,
  options?: ActionOptions,
): ActionResult {
  assertIsPlaying(state);
  assertCurrentPlayer(state, playerId);
  assertPhase(state, "draw");

  if (state.deck.length === 0) {
    throw new RuleError(RULE_ERROR_CODES.DECK_EMPTY_INVALID_STATE);
  }

  const isLastCard = state.deck.length === 1;
  const drawnCard = state.deck[0]!;
  const remainingDeck = state.deck.slice(1);

  const playerIdx = findPlayerIndex(state, playerId);

  const now = eventOccurredAt(options);

  const drawEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "CARD_DRAWN_FROM_DECK",
    playerId,
  };

  const newPlayers = clonePlayers(state);
  newPlayers[playerIdx] = {
    ...newPlayers[playerIdx]!,
    hand: [...newPlayers[playerIdx]!.hand, drawnCard],
  };

  if (isLastCard) {
    // 摸到最后一张牌：
    // 事件顺序: CARD_DRAWN_FROM_DECK → TURN_COMPLETED → GAME_FINISHED
    // 不推进玩家、不增加 turnNumber
    const turnEvent: GameEvent = {
      id: nextEventId(state, 1),
      occurredAt: now,
      type: "TURN_COMPLETED",
      playerId,
    };

    const finalResult = calculateFinalResult(newPlayers);
    const finishEvent: GameEvent = {
      id: nextEventId(state, 2),
      occurredAt: now,
      type: "GAME_FINISHED",
      result: finalResult,
    };

    return {
      state: {
        ...state,
        players: newPlayers,
        deck: remainingDeck,
        status: "finished",
        phase: "finished",
        finalResult,
        events: [...state.events, drawEvent, turnEvent, finishEvent],
      },
      events: [drawEvent, turnEvent, finishEvent],
    };
  }

  // 正常推进回合
  const afterAdvance = advanceTurn(
    {
      ...state,
      players: newPlayers,
      deck: remainingDeck,
      events: [...state.events, drawEvent],
    },
    playerId,
    { now },
  );

  const turnEvent: GameEvent = {
    id: nextEventId(state, 1),
    occurredAt: now,
    type: "TURN_COMPLETED",
    playerId,
  };

  return {
    state: afterAdvance,
    events: [drawEvent, turnEvent],
  };
}

// ---------------------------------------------------------------------------
// 4. 从弃牌堆摸牌
// ---------------------------------------------------------------------------

export function drawFromDiscard(
  state: GameState,
  playerId: PlayerId,
  color: CardColor,
  options?: ActionOptions,
): ActionResult {
  assertIsPlaying(state);
  assertCurrentPlayer(state, playerId);
  assertPhase(state, "draw");

  const pile = state.discardPiles[color];
  if (pile.length === 0) {
    throw new RuleError(RULE_ERROR_CODES.DISCARD_PILE_EMPTY);
  }

  // 弃牌堆顶部 = 数组最后一个元素
  const topCard = pile[pile.length - 1]!;

  // 不能摸回自己本回合刚弃掉的牌
  if (
    state.lastDiscardedThisTurn?.playerId === playerId &&
    state.lastDiscardedThisTurn?.color === color &&
    state.lastDiscardedThisTurn?.cardId === topCard.id
  ) {
    throw new RuleError(RULE_ERROR_CODES.CANNOT_DRAW_OWN_DISCARD);
  }

  const playerIdx = findPlayerIndex(state, playerId);

  const now = eventOccurredAt(options);
  const drawEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "CARD_DRAWN_FROM_DISCARD",
    playerId,
    cardId: topCard.id,
    color,
  };

  const newPlayers = clonePlayers(state);
  newPlayers[playerIdx] = {
    ...newPlayers[playerIdx]!,
    hand: [...newPlayers[playerIdx]!.hand, topCard],
  };

  const newDiscardPile = pile.slice(0, -1);

  const afterDraw = {
    ...state,
    players: newPlayers,
    discardPiles: {
      ...state.discardPiles,
      [color]: newDiscardPile,
    },
    events: [...state.events, drawEvent],
  };

  const newState = advanceTurn(afterDraw, playerId, { now });

  const turnEvent: GameEvent = {
    id: nextEventId(state, 1),
    occurredAt: now,
    type: "TURN_COMPLETED",
    playerId,
  };

  return {
    state: newState,
    events: [drawEvent, turnEvent],
  };
}

// ---------------------------------------------------------------------------
// 5. 跳过出牌
// ---------------------------------------------------------------------------

export function skipPlayNoLegalAction(
  state: GameState,
  playerId: PlayerId,
  options?: ActionOptions,
): ActionResult {
  assertIsPlaying(state);
  assertCurrentPlayer(state, playerId);
  assertPhase(state, "play");

  // 如果玩家有合法出牌动作，拒绝跳过
  if (hasAnyLegalPlay(state, playerId)) {
    throw new RuleError(RULE_ERROR_CODES.LEGAL_PLAY_AVAILABLE);
  }

  const now = eventOccurredAt(options);
  const skipEvent: GameEvent = {
    id: nextEventId(state, 0),
    occurredAt: now,
    type: "PLAY_PHASE_SKIPPED",
    playerId,
    reason: "NO_LEGAL_ACTION",
  };

  return {
    state: {
      ...state,
      phase: "draw",
      events: [...state.events, skipEvent],
    },
    events: [skipEvent],
  };
}

// ---------------------------------------------------------------------------
// 6. 统一分发
// ---------------------------------------------------------------------------

/**
 * 根据 GameAction.type 分发到对应的纯函数。
 *
 * 外部只需调用此函数即可处理所有玩家动作。
 */
export function applyGameAction(
  state: GameState,
  action: GameAction,
  options?: ActionOptions,
): ActionResult {
  switch (action.type) {
    case "PLACE_CARD":
      return placeCardToColumn(
        state,
        action.playerId,
        action.cardId,
        action.color,
        options,
      );
    case "DISCARD_CARD":
      return discardCard(state, action.playerId, action.cardId, options);
    case "DRAW_FROM_DECK":
      return drawFromDeck(state, action.playerId, options);
    case "DRAW_FROM_DISCARD":
      return drawFromDiscard(
        state,
        action.playerId,
        action.color,
        options,
      );
    case "SKIP_PLAY_NO_LEGAL_ACTION":
      return skipPlayNoLegalAction(state, action.playerId, options);
  }
}