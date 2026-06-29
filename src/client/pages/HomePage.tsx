import type { TimeControlMode } from "../../server/timer/time-control";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { CreateRoomPanel } from "../components/CreateRoomPanel";
import { ErrorBanner } from "../components/ErrorBanner";
import { JoinRoomPanel } from "../components/JoinRoomPanel";
import { RoomLobby } from "../components/RoomLobby";
import { useGameSocket } from "../hooks/useGameSocket";
import type { SocketConnectionState } from "../socket";
import { GamePage } from "./GamePage";

interface HomePageProps {
  connectionState: SocketConnectionState;
  pending?: string;
  error?: string;
  onDismissError: () => void;
  onCreate: (nickname: string, mode: TimeControlMode) => void;
  onJoin: (nickname: string, roomId: string) => void;
}

export function HomePage({
  connectionState,
  pending,
  error,
  onDismissError,
  onCreate,
  onJoin,
}: HomePageProps) {
  const unavailable = connectionState.status !== "connected" || Boolean(pending);
  return (
    <main className="formal-shell home-page">
      <nav className="formal-nav">
        <div className="formal-mark">LO / 2038</div>
        <ConnectionStatus state={connectionState} />
      </nav>

      <ErrorBanner message={error} onDismiss={onDismissError} />

      <section className="hero">
        <div className="hero__copy">
          <span className="brand-kicker">THE LAST OPENING</span>
          <h1 data-testid="home-title">最后岗位</h1>
          <p className="hero__slogan" data-testid="home-slogan">
            最后一个岗位被拿走前，完成你的转型。
          </p>
          <p className="hero__intro">
            2–4 人多人策略卡牌游戏。选择职业赛道，积累能力，
            在时代关闭机会窗口以前押注自己的未来。
          </p>
        </div>
        <div className="hero__signal" aria-hidden="true">
          <span>2038</span>
          <strong>10%</strong>
          <small>岗位仍向人类开放</small>
        </div>
      </section>

      <section className="entry-grid">
        <CreateRoomPanel disabled={unavailable} onCreate={onCreate} />
        <JoinRoomPanel disabled={unavailable} onJoin={onJoin} />
      </section>

      <section className="rules-brief" id="rules">
        <div>
          <span className="eyebrow">快速规则</span>
          <h2>每一次选择，都在改写你的履历。</h2>
        </div>
        <ol>
          <li><span>01</span>每回合先规划一次转型，再寻找一个机会。</li>
          <li><span>02</span>能力等级只能递增，风口必须在成长前押注。</li>
          <li><span>03</span>当最后岗位被领取，所有人的职业命运立即结算。</li>
        </ol>
      </section>
    </main>
  );
}

export function FormalGameApp() {
  const game = useGameSocket();

  if (!game.room) {
    return (
      <HomePage
        connectionState={game.connectionState}
        pending={game.pending}
        error={game.error}
        onDismissError={() => game.setError(undefined)}
        onCreate={game.createRoom}
        onJoin={game.joinRoom}
      />
    );
  }

  if (game.room.status === "waiting") {
    return (
      <>
        <ErrorBanner
          message={game.error}
          onDismiss={() => game.setError(undefined)}
        />
        <RoomLobby
          room={game.room}
          playerId={game.playerId}
          pending={game.pending}
          onStart={game.startGame}
          onLeave={game.leaveRoom}
        />
      </>
    );
  }

  if (game.view && game.roomId) {
    return (
      <GamePage
        roomId={game.roomId}
        playerId={game.playerId}
        view={game.view}
        timerSnapshot={game.timerSnapshot}
        connectionState={game.connectionState}
        selectedCardId={game.selectedCardId}
        error={game.error}
        onDismissError={() => game.setError(undefined)}
        onSelectCard={game.setSelectedCardId}
        onPlace={game.placeCard}
        onDiscard={game.discardSelectedCard}
        onDrawJobPool={game.drawFromJobPool}
        onDrawMarket={game.drawFromTalentMarket}
      />
    );
  }

  return (
    <main className="formal-shell loading-page">
      <span className="brand-kicker">THE LAST OPENING</span>
      <h1>正在载入职业档案</h1>
      <ConnectionStatus state={game.connectionState} />
    </main>
  );
}
