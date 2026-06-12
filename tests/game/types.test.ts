import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BASE_ACTION_TIME_SECONDS,
  CARD_COLORS,
  DECK_SIZE_BY_PLAYER_COUNT,
  INITIAL_HAND_SIZE,
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
  NUMBER_VALUES,
  PLAYER_EXTRA_TIME_POOL_SECONDS,
  RULE_ERROR_CODES,
  mathRandomSource,
} from "../../src/game";
import type {
  Card,
  CardColor,
  GameAction,
  GameState,
  NumberValue,
  RandomSource,
  RuleErrorCode,
} from "../../src/game";

describe("game constants", () => {
  it("exports the supported colors and number values", () => {
    expect(CARD_COLORS).toEqual([
      "red",
      "blue",
      "yellow",
      "green",
      "white",
    ]);
    expect(NUMBER_VALUES).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("exports player, hand, deck, and timer constants", () => {
    expect(MIN_PLAYER_COUNT).toBe(2);
    expect(MAX_PLAYER_COUNT).toBe(4);
    expect(INITIAL_HAND_SIZE).toBe(8);
    expect(DECK_SIZE_BY_PLAYER_COUNT).toEqual({ 2: 60, 3: 82, 4: 108 });
    expect(BASE_ACTION_TIME_SECONDS).toBe(20);
    expect(PLAYER_EXTRA_TIME_POOL_SECONDS).toBe(50);
  });
});

describe("game type exports", () => {
  it("provides the core domain unions", () => {
    expectTypeOf<CardColor>().toEqualTypeOf<
      "red" | "blue" | "yellow" | "green" | "white"
    >();
    expectTypeOf<NumberValue>().toEqualTypeOf<
      2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
    >();
    expectTypeOf<Card>().toBeObject();
    expectTypeOf<GameAction>().toBeObject();
    expectTypeOf<GameState>().toBeObject();
  });

  it("exports stable rule error codes", () => {
    expect(RULE_ERROR_CODES.NOT_CURRENT_PLAYER).toBe("NOT_CURRENT_PLAYER");
    expectTypeOf(RULE_ERROR_CODES.NOT_CURRENT_PLAYER).toMatchTypeOf<RuleErrorCode>();
  });

  it("exports an injectable random source", () => {
    expectTypeOf(mathRandomSource).toMatchTypeOf<RandomSource>();
    const value = mathRandomSource.next();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
