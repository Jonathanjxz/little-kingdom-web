export type CardColor = "red" | "blue" | "yellow" | "green" | "white";

export type NumberValue = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

declare const cardIdBrand: unique symbol;
declare const playerIdBrand: unique symbol;
declare const roomIdBrand: unique symbol;

export type CardId = string & { readonly [cardIdBrand]: true };
export type PlayerId = string & { readonly [playerIdBrand]: true };
export type RoomId = string & { readonly [roomIdBrand]: true };

export interface NumberCard {
  id: CardId;
  type: "number";
  color: CardColor;
  value: NumberValue;
}

export interface MultiplierCard {
  id: CardId;
  type: "multiplier";
  color: CardColor;
}

export interface WildCard {
  id: CardId;
  type: "wild";
}

export type Card = NumberCard | MultiplierCard | WildCard;

export type WildCardRole =
  | { type: "multiplier" }
  | { type: "number"; effectiveValue: NumberValue };

/**
 * A placed wild card keeps the role assigned when it entered the column.
 */
export type PlacedCard =
  | { card: NumberCard | MultiplierCard }
  | { card: WildCard; wildRole: WildCardRole };

export type StatusEffectOwnerType = "player" | "column" | "room";

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  ownerType: StatusEffectOwnerType;
  ownerId: string;
  duration?: {
    type: "turns" | "rounds" | "permanent";
    remaining?: number;
  };
}

export interface PlayerColumn {
  color: CardColor;
  cards: PlacedCard[];
  statusEffects: StatusEffect[];
}

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  hand: Card[];
  columns: Record<CardColor, PlayerColumn>;
  statusEffects: StatusEffect[];
  isConnected: boolean;
  extraTimeRemainingSeconds: number;
}

export type GamePhase = "play" | "draw" | "finished";
export type GameStatus = "waiting" | "playing" | "finished";

export interface TurnDiscardRecord {
  playerId: PlayerId;
  cardId: CardId;
  color: CardColor;
}

export interface RankingEntry {
  playerId: PlayerId;
  nickname: string;
  score: number;
  rank: number;
  isWinner: boolean;
}

export interface FinalResult {
  rankings: RankingEntry[];
  winnerIds: PlayerId[];
}

export type GameAction =
  | {
      type: "PLACE_CARD";
      playerId: PlayerId;
      cardId: CardId;
      color: CardColor;
    }
  | {
      type: "DISCARD_CARD";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      type: "DRAW_FROM_DECK";
      playerId: PlayerId;
    }
  | {
      type: "DRAW_FROM_DISCARD";
      playerId: PlayerId;
      color: CardColor;
    }
  | {
      type: "SKIP_PLAY_NO_LEGAL_ACTION";
      playerId: PlayerId;
    };

interface GameEventBase {
  id: string;
  occurredAt: number;
  playerId?: PlayerId;
}

export type GameEvent =
  | (GameEventBase & {
      type: "CARD_PLACED";
      playerId: PlayerId;
      cardId: CardId;
      color: CardColor;
    })
  | (GameEventBase & {
      type: "CARD_DISCARDED";
      playerId: PlayerId;
      cardId: CardId;
      color: CardColor;
    })
  | (GameEventBase & {
      type: "CARD_DRAWN_FROM_DECK";
      playerId: PlayerId;
    })
  | (GameEventBase & {
      type: "CARD_DRAWN_FROM_DISCARD";
      playerId: PlayerId;
      cardId: CardId;
      color: CardColor;
    })
  | (GameEventBase & {
      type: "PLAY_PHASE_SKIPPED";
      playerId: PlayerId;
      reason: "NO_LEGAL_ACTION" | "TIMEOUT";
    })
  | (GameEventBase & {
      type: "TURN_COMPLETED";
      playerId: PlayerId;
    })
  | (GameEventBase & {
      type: "GAME_FINISHED";
      result: FinalResult;
    });

export interface GameState {
  roomId: RoomId;
  status: GameStatus;
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerId?: PlayerId;
  turnNumber: number;
  deck: Card[];
  discardPiles: Record<CardColor, Card[]>;
  lastDiscardedThisTurn?: TurnDiscardRecord;
  operationStartedAt?: number;
  statusEffects: StatusEffect[];
  events: GameEvent[];
  finalResult?: FinalResult;
}
