import type { Card, CardColor, PlayerId, RoomId } from "../../game/types";
import type { PlayerGameView } from "../../game/view";
import { ErrorBanner } from "../components/ErrorBanner";
import { GameBoard } from "../components/GameBoard";
import type { SocketConnectionState } from "../socket";
import { useServerTimer } from "../hooks/useServerTimer";
import type { TimerSnapshot } from "../hooks/useServerTimer";
import { useSoundEffects } from "../hooks/useSoundEffects";

interface GamePageProps {
  roomId: RoomId;
  playerId?: PlayerId;
  view: PlayerGameView;
  timerSnapshot?: TimerSnapshot;
  connectionState: SocketConnectionState;
  selectedCardId?: Card["id"];
  error?: string;
  onDismissError: () => void;
  onSelectCard: (cardId?: Card["id"]) => void;
  onPlace: (color: CardColor) => void;
  onDiscard: () => void;
  onDrawJobPool: () => void;
  onDrawMarket: (color: CardColor) => void;
}

export function GamePage(props: GamePageProps) {
  const timerData = useServerTimer(props.timerSnapshot);
  const sound = useSoundEffects(
    props.view,
    props.playerId,
    timerData.operationRemainingSeconds,
  );
  return (
    <>
      <ErrorBanner message={props.error} onDismiss={props.onDismissError} />
      <GameBoard
        roomId={props.roomId}
        playerId={props.playerId}
        view={props.view}
        timerData={timerData}
        connectionState={props.connectionState}
        selectedCardId={props.selectedCardId}
        onSelectCard={props.onSelectCard}
        onPlace={props.onPlace}
        onDiscard={props.onDiscard}
        onDrawJobPool={props.onDrawJobPool}
        onDrawMarket={props.onDrawMarket}
        soundEnabled={sound.enabled}
        onToggleSound={sound.toggle}
      />
    </>
  );
}
