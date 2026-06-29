import type { Card, CardColor, PlayerId, RoomId } from "../../game/types";
import type { PlayerGameView } from "../../game/view";
import type { PublicTimerView } from "../../server/rooms/room-types";
import type { SocketConnectionState } from "../socket";
import { CareerColumn } from "./CareerColumn";
import { ActionPrompt } from "./ActionPrompt";
import { ConnectionStatus } from "./ConnectionStatus";
import { DiscardPiles } from "./DiscardPiles";
import { EventLog } from "./EventLog";
import { FinalRanking } from "./FinalRanking";
import { Hand } from "./Hand";
import { PlayerArea } from "./PlayerArea";
import { TimerPanel } from "./TimerPanel";
import { SoundToggle } from "./SoundToggle";

interface GameTimerData {
  timer?: PublicTimerView;
  operationRemainingSeconds?: number;
  extraRemainingSeconds?: number;
}

interface GameBoardProps {
  roomId: RoomId;
  playerId?: PlayerId;
  view: PlayerGameView;
  timerData: GameTimerData;
  connectionState: SocketConnectionState;
  selectedCardId?: Card["id"];
  onSelectCard: (cardId?: Card["id"]) => void;
  onPlace: (color: CardColor) => void;
  onDiscard: () => void;
  onDrawJobPool: () => void;
  onDrawMarket: (color: CardColor) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function GameBoard({
  roomId,
  playerId,
  view,
  timerData,
  connectionState,
  selectedCardId,
  onSelectCard,
  onPlace,
  onDiscard,
  onDrawJobPool,
  onDrawMarket,
  soundEnabled,
  onToggleSound,
}: GameBoardProps) {
  const isMyTurn = view.currentPlayerId === playerId;
  const isPlayPhase = view.phase === "play";
  const isDrawPhase = view.phase === "draw";
  const currentPlayer = view.players.find(
    (player) => player.id === view.currentPlayerId,
  );
  const timerWarning =
    isMyTurn &&
    timerData.operationRemainingSeconds !== undefined &&
    timerData.operationRemainingSeconds <= 5;

  return (
    <main
      className={`formal-shell game-page${isMyTurn ? " is-my-turn" : ""} phase-${view.phase}`}
      data-testid="game-board"
    >
      <header className="game-status-bar">
        <div className="game-status-bar__brand">
          <span>最后岗位</span>
          <small>The Last Opening</small>
        </div>
        <div className="game-status-bar__state">
          <span className="eyebrow">当前行动</span>
          <strong data-testid="game-phase">
            {view.phase === "play"
              ? "规划转型"
              : view.phase === "draw"
                ? "寻找机会"
                : "岗位窗口关闭"}
          </strong>
          <span data-testid="current-player">
            {isMyTurn ? "轮到你" : currentPlayer?.nickname ?? view.currentPlayerId}
          </span>
        </div>
        {timerData.timer && (
          <TimerPanel
            mode={timerData.timer.mode}
            phase={timerData.timer.phase}
            operationRemainingSeconds={timerData.operationRemainingSeconds}
            extraRemainingSeconds={timerData.extraRemainingSeconds}
            warning={timerWarning}
          />
        )}
        <div className="game-status-bar__meta">
          <span>{roomId}</span>
          <ConnectionStatus state={connectionState} compact />
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
        </div>
      </header>

      <ActionPrompt
        isMyTurn={isMyTurn}
        phase={view.phase}
        currentPlayerName={currentPlayer?.nickname}
        warning={timerWarning}
      />

      <div className="game-workspace">
        <div className="game-table">
      <section className="opponents">
        <div className="section-heading">
          <div>
            <span className="eyebrow">同行候选人</span>
            <h2>公开职业轨迹</h2>
          </div>
        </div>
        <div className="opponents__grid">
          {view.players
            .filter((player) => player.id !== playerId)
            .map((player) => (
              <PlayerArea
                key={player.id}
                player={player}
                currentPlayerId={view.currentPlayerId}
              />
            ))}
        </div>
      </section>

        <section className={`opportunity-center${isMyTurn && isDrawPhase ? " is-actionable" : ""}`}>
          <div className="job-pool" data-testid="job-pool">
            <span className="eyebrow">2038 最后一批开放岗位</span>
            <div className="job-pool__count">
              <strong>{view.deckCount}</strong>
              <span>个岗位仍未开放</span>
            </div>
            {isMyTurn && isDrawPhase && (
              <button
                type="button"
                className="primary-action"
                onClick={onDrawJobPool}
                data-testid="draw-deck-button"
              >
                从岗位池寻找机会
              </button>
            )}
          </div>
          <DiscardPiles
            piles={view.discardPiles}
            canDraw={isMyTurn && isDrawPhase}
            onDraw={onDrawMarket}
          />
        </section>

      <section className="self-careers">
        <div className="section-heading">
          <div>
            <span className="eyebrow">你的职业版图</span>
            <h2>五条转型赛道</h2>
          </div>
          {isMyTurn && isPlayPhase && (
            <button
              type="button"
              className="danger-action"
              onClick={onDiscard}
              disabled={!selectedCardId}
              data-testid="discard-selected-button"
            >
              放入人才市场
            </button>
          )}
        </div>
        <div className="self-careers__grid">
          {(Object.keys(view.self.columns) as CardColor[]).map((color) => (
            <CareerColumn
              key={color}
              color={color}
              column={view.self.columns[color]}
              canPlace={isMyTurn && isPlayPhase && Boolean(selectedCardId)}
              onPlace={onPlace}
            />
          ))}
        </div>
      </section>
        </div>
        <EventLog events={view.events} />
      </div>

      <Hand
        cards={view.self.hand}
        selectedCardId={selectedCardId}
        onSelect={onSelectCard}
        active={isMyTurn && isPlayPhase}
      />

      <FinalRanking result={view.finalResult} />
    </main>
  );
}
