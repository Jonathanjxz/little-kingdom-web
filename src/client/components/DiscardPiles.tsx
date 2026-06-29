import type { Card, CardColor } from "../../game/types";
import { GameCard, TRACK_META } from "./GameCard";

interface DiscardPilesProps {
  piles: Record<CardColor, Card[]>;
  canDraw: boolean;
  onDraw: (color: CardColor) => void;
}

export function DiscardPiles({ piles, canDraw, onDraw }: DiscardPilesProps) {
  return (
    <section className="talent-market" data-testid="talent-market">
      <div className="section-heading">
        <div>
          <span className="eyebrow">公开机会</span>
          <h2>人才市场</h2>
        </div>
        <span>仅可获取顶层机会</span>
      </div>
      <div className="talent-market__grid">
        {(Object.keys(piles) as CardColor[]).map((color) => {
          const pile = piles[color];
          const topCard = pile[pile.length - 1];
          return (
            <div className={`market-slot market-slot--${color}`} key={color}>
              <span>{TRACK_META[color].label}</span>
              {topCard ? (
                <GameCard card={topCard} compact />
              ) : (
                <div className="market-slot__empty">暂无机会</div>
              )}
              <small>{pile.length} 张</small>
              {canDraw && topCard && (
                <button
                  type="button"
                  onClick={() => onDraw(color)}
                  data-testid={`draw-discard-${color}`}
                >
                  获取机会
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
