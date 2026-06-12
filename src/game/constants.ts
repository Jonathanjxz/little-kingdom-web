import type { CardColor, NumberValue } from "./types";

export const CARD_COLORS = [
  "red",
  "blue",
  "yellow",
  "green",
  "white",
] as const satisfies readonly CardColor[];

export const NUMBER_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const satisfies readonly NumberValue[];

export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 4;
export const INITIAL_HAND_SIZE = 8;

export const DECK_SIZE_BY_PLAYER_COUNT = {
  2: 60,
  3: 82,
  4: 108,
} as const;

export const BASE_ACTION_TIME_SECONDS = 20;
export const PLAYER_EXTRA_TIME_POOL_SECONDS = 50;
