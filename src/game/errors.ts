export const RULE_ERROR_CODES = {
  NOT_CURRENT_PLAYER: "NOT_CURRENT_PLAYER",
  WRONG_PHASE: "WRONG_PHASE",
  CARD_NOT_IN_HAND: "CARD_NOT_IN_HAND",
  ILLEGAL_COLUMN_PLACEMENT: "ILLEGAL_COLUMN_PLACEMENT",
  WILD_CANNOT_BE_DISCARDED: "WILD_CANNOT_BE_DISCARDED",
  DISCARD_PILE_EMPTY: "DISCARD_PILE_EMPTY",
  CANNOT_DRAW_OWN_DISCARD: "CANNOT_DRAW_OWN_DISCARD",
  GAME_ALREADY_FINISHED: "GAME_ALREADY_FINISHED",
  DECK_EMPTY_INVALID_STATE: "DECK_EMPTY_INVALID_STATE",
  INVALID_PLAYER_COUNT: "INVALID_PLAYER_COUNT",
} as const;

export type RuleErrorCode =
  (typeof RULE_ERROR_CODES)[keyof typeof RULE_ERROR_CODES];

export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode, message = code) {
    super(message);
    this.name = "RuleError";
    this.code = code;
  }
}
