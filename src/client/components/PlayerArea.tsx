import type { CardColor, PlayerId } from "../../game/types";
import type { PublicPlayerView } from "../../game/view";
import { CareerColumn } from "./CareerColumn";

interface PlayerAreaProps {
  player: PublicPlayerView;
  currentPlayerId?: PlayerId;
}

export function PlayerArea({ player, currentPlayerId }: PlayerAreaProps) {
  return (
    <article className={`player-area${currentPlayerId === player.id ? " is-current" : ""}`}>
      <header>
        <div>
          <span className={`presence-dot${player.isConnected ? " is-online" : ""}`} />
          <strong>{player.nickname}</strong>
        </div>
        <span>{player.handCount} 张机会</span>
      </header>
      <div className="player-area__tracks">
        {(Object.keys(player.columns) as CardColor[]).map((color) => (
          <CareerColumn
            key={color}
            color={color}
            column={player.columns[color]}
            compact
          />
        ))}
      </div>
    </article>
  );
}
