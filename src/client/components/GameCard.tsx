import type { Card } from "../../game/types";

export const TRACK_META = {
  red: { label: "娱乐", code: "ENT" },
  blue: { label: "科技", code: "TEC" },
  yellow: { label: "教育", code: "EDU" },
  green: { label: "医疗", code: "MED" },
  white: { label: "创业", code: "NEW" },
} as const;

export function formatWorldCard(card: Card): string {
  if (card.type === "wild") return "贵人 / 奇迹";
  const track = TRACK_META[card.color].label;
  return card.type === "multiplier"
    ? `${track}风口`
    : `${track} · 能力 ${card.value}`;
}

interface GameCardProps {
  card: Card;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  testId?: string;
}

export function GameCard({
  card,
  selected,
  compact,
  onClick,
  testId,
}: GameCardProps) {
  const color = card.type === "wild" ? "wild" : card.color;
  const typeLabel = card.type === "number"
    ? "能力等级"
    : card.type === "multiplier"
      ? "风口"
      : "特殊机会";

  return (
    <button
      type="button"
      className={`game-card game-card--${color}${selected ? " is-selected" : ""}${compact ? " game-card--compact" : ""}${onClick ? " is-interactive" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      data-testid={testId}
      aria-pressed={onClick ? selected : undefined}
    >
      <span className="game-card__type">{typeLabel}</span>
      <strong className="game-card__value">
        {card.type === "number" ? card.value : card.type === "multiplier" ? "↗" : "✦"}
      </strong>
      <span className="game-card__name">{formatWorldCard(card)}</span>
    </button>
  );
}
