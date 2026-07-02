import { canPlaceCard } from "../game/column";
import { CARD_COLORS } from "../game/constants";
import type { Card, CardColor, PlayerColumn } from "../game/types";

export function getSelectedCard(
  hand: Card[],
  selectedCardId?: Card["id"],
): Card | undefined {
  if (!selectedCardId) return undefined;
  return hand.find((card) => card.id === selectedCardId);
}

export function getLegalPlaceColors(
  card: Card | undefined,
  columns: Record<CardColor, PlayerColumn>,
): CardColor[] {
  if (!card) return [];

  if (card.type !== "wild") {
    const column = columns[card.color];
    return canPlaceCard(column, card) ? [card.color] : [];
  }

  return CARD_COLORS.filter((color) => canPlaceCard(columns[color], card));
}

export function getResolvedPlaceColor(
  card: Card | undefined,
  legalColors: CardColor[],
  requestedColor?: CardColor,
): CardColor | undefined {
  if (!card || legalColors.length === 0) return undefined;
  if (card.type !== "wild") return legalColors[0];
  return requestedColor && legalColors.includes(requestedColor)
    ? requestedColor
    : legalColors[0];
}

export function canDiscardSelectedCard(card: Card | undefined): boolean {
  return Boolean(card && card.type !== "wild");
}
