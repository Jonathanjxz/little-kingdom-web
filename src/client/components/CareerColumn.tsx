import type { CardColor, PlayerColumn } from "../../game/types";
import { formatWorldCard, TRACK_META } from "./GameCard";

interface CareerColumnProps {
  color: CardColor;
  column: PlayerColumn;
  canPlace?: boolean;
  onPlace?: (color: CardColor) => void;
  compact?: boolean;
}

export function CareerColumn({
  color,
  column,
  canPlace,
  onPlace,
  compact,
}: CareerColumnProps) {
  const meta = TRACK_META[color];
  return (
    <div className={`career-column career-column--${color}${compact ? " career-column--compact" : ""}`}>
      <header>
        <span className="career-column__code">{meta.code}</span>
        <strong>{meta.label}</strong>
      </header>
      <div className="career-column__track">
        {column.cards.length === 0 ? (
          <span className="career-column__empty">尚未投入</span>
        ) : (
          column.cards.map((placed) => (
            <span className="career-column__chip" key={placed.card.id}>
              {formatWorldCard(placed.card)}
            </span>
          ))
        )}
      </div>
      {canPlace && onPlace && (
        <button
          type="button"
          className="career-column__action"
          onClick={() => onPlace(color)}
          data-testid={`play-column-${color}`}
        >
          投入此赛道
        </button>
      )}
    </div>
  );
}
