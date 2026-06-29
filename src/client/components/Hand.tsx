import type {
  Card,
  CardColor,
  MultiplierCard,
  NumberCard,
} from "../../game/types";
import { GameCard } from "./GameCard";

const COLOR_ORDER: Record<CardColor, number> = {
  red: 0,
  blue: 1,
  yellow: 2,
  green: 3,
  white: 4,
};

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.type === "wild") return b.type === "wild" ? 0 : 1;
    if (b.type === "wild") return -1;
    const cardA = a as NumberCard | MultiplierCard;
    const cardB = b as NumberCard | MultiplierCard;
    const colorDifference = COLOR_ORDER[cardA.color] - COLOR_ORDER[cardB.color];
    if (colorDifference !== 0) return colorDifference;
    if (cardA.type === "multiplier") return cardB.type === "multiplier" ? 0 : -1;
    if (cardB.type === "multiplier") return 1;
    return cardA.value - cardB.value;
  });
}

interface HandProps {
  cards: Card[];
  selectedCardId?: Card["id"];
  onSelect: (cardId?: Card["id"]) => void;
  active: boolean;
}

export function Hand({ cards, selectedCardId, onSelect, active }: HandProps) {
  return (
    <section className={`hand-dock${active ? " is-active" : ""}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">私人履历夹</span>
          <h2>你的机会手牌</h2>
        </div>
        <span>{cards.length} 张</span>
      </div>
      <div className="hand-scroll" data-testid="hand-area">
        {sortHand(cards).map((card) => (
          <GameCard
            key={card.id}
            card={card}
            selected={selectedCardId === card.id}
            onClick={active
              ? () => onSelect(selectedCardId === card.id ? undefined : card.id)
              : undefined}
            testId={`card-button-${card.id}`}
          />
        ))}
      </div>
    </section>
  );
}
