/// <reference types="vite/client" />

import { useCallback, useEffect, useState } from "react";
import { socket, getConnectionState } from "./socket";
import type { SocketConnectionState } from "./socket";
import type { PublicRoomView } from "../server/socket/protocol";
import type { PlayerGameView } from "../game/view";
import type { Card, CardColor, GameAction, MultiplierCard, NumberCard, PlayerId, RoomId } from "../game/types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const STORAGE_KEY = "kg-session";

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const COLOR_LABELS: Record<CardColor, string> = {
  red: "红",
  blue: "蓝",
  yellow: "黄",
  green: "绿",
  white: "白",
};

function formatCard(card: Card): string {
  if (card.type === "wild") return "万能";
  const color = COLOR_LABELS[card.color];
  if (card.type === "multiplier") return `${color} ×`;
  return `${color} ${card.value}`;
}

/** UI 层手牌排序（不修改服务端状态）: 颜色顺序 → 同色 multiplier 在前 → number 从小到大 → wild 最后 */
const COLOR_ORDER: Record<CardColor, number> = {
  red: 0, blue: 1, yellow: 2, green: 3, white: 4,
};

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    // wild always last
    if (a.type === "wild" && b.type !== "wild") return 1;
    if (b.type === "wild" && a.type !== "wild") return -1;
    if (a.type === "wild" && b.type === "wild") return 0;

    // at this point both are non-wild
    const nA = a as NumberCard | MultiplierCard;
    const nB = b as NumberCard | MultiplierCard;

    // color order
    const colorA = COLOR_ORDER[nA.color as CardColor] ?? 99;
    const colorB = COLOR_ORDER[nB.color as CardColor] ?? 99;
    if (colorA !== colorB) return colorA - colorB;

    // same color: multiplier first
    if (nA.type === "multiplier" && nB.type !== "multiplier") return -1;
    if (nB.type === "multiplier" && nA.type !== "multiplier") return 1;

    // same color, both number → ascending
    if (nA.type === "number" && nB.type === "number") {
      return nA.value - nB.value;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

interface SavedSession {
  roomId: RoomId;
  playerId: PlayerId;
  sessionToken: string;
}

function saveSession(s: SavedSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [nickname, setNickname] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomId, setRoomId] = useState<RoomId | undefined>();
  const [playerId, setPlayerId] = useState<PlayerId | undefined>();
  const [sessionToken, setSessionToken] = useState<string | undefined>();
  const [room, setRoom] = useState<PublicRoomView | undefined>();
  const [view, setView] = useState<PlayerGameView | undefined>();
  const [selectedCardId, setSelectedCardId] = useState<Card["id"] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [connState, setConnState] = useState<SocketConnectionState>({
    status: "disconnected",
    reason: "正在连接...",
  });

  // Socket listeners
  useEffect(() => {
    const onRoomUpdated = (p: { room: PublicRoomView }) => setRoom(p.room);
    const onGameView = (p: { view: PlayerGameView }) => setView(p.view);

    socket.on("room:updated", onRoomUpdated);
    socket.on("game:view", onGameView);

    const tearDown = getConnectionState(setConnState);

    return () => {
      socket.off("room:updated", onRoomUpdated);
      socket.off("game:view", onGameView);
      tearDown();
    };
  }, []);

  // Auto-reconnect when socket connects
  useEffect(() => {
    if (connState.status !== "connected") return;
    if (sessionToken) return; // already reconnected

    const saved = loadSession();
    if (!saved || !saved.roomId || !saved.playerId || !saved.sessionToken) return;

    socket.emit(
      "room:reconnect",
      {
        roomId: saved.roomId,
        playerId: saved.playerId,
        sessionToken: saved.sessionToken,
      },
      (ack) => {
        if (!ack.ok) {
          setError(`自动重连失败: ${ack.error?.code}`);
          clearSession();
          return;
        }
        setError(undefined);
        setRoomId(saved.roomId);
        setPlayerId(saved.playerId);
        setSessionToken(saved.sessionToken);
        if (ack.data) {
          setRoom(ack.data.room);
          if (ack.data.view) setView(ack.data.view);
        }
      },
    );
  }, [connState]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const createRoom = useCallback(() => {
    if (!nickname) return;
    socket.emit("room:create", { nickname }, (ack) => {
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
      const data = ack.data!;
      setRoomId(data.room.roomId);
      setPlayerId(data.playerId);
      setSessionToken(data.sessionToken);
      setRoom(data.room);
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
    });
  }, [nickname]);

  const joinRoom = useCallback(() => {
    if (!nickname || !roomIdInput) return;
    socket.emit("room:join", { roomId: roomIdInput as RoomId, nickname }, (ack) => {
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
      const data = ack.data!;
      setRoomId(data.room.roomId);
      setPlayerId(data.playerId);
      setSessionToken(data.sessionToken);
      setRoom(data.room);
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
    });
  }, [nickname, roomIdInput]);

  const leaveRoom = useCallback(() => {
    socket.emit("room:leave", {}, (ack) => {
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
      clearSession();
      setRoomId(undefined);
      setPlayerId(undefined);
      setSessionToken(undefined);
      setRoom(undefined);
      setView(undefined);
    });
  }, []);

  const startGame = useCallback(() => {
    socket.emit("game:start", {}, (ack) => {
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
    });
  }, []);

  const sendAction = useCallback(
    (action: GameAction) => {
      socket.emit("game:action", { action }, (ack) => {
        if (!ack.ok) {
          setError(`${ack.error?.code}: ${ack.error?.message}`);
          return;
        }
        setError(undefined);
        setSelectedCardId(undefined);
      });
    },
    [],
  );

  const placeCard = useCallback(
    (color: CardColor) => {
      if (!selectedCardId) return;
      sendAction({
        type: "PLACE_CARD",
        playerId: "",
        cardId: selectedCardId,
        color,
      } as GameAction);
    },
    [selectedCardId, sendAction],
  );

  const discardCard = useCallback(() => {
    if (!selectedCardId) return;
    sendAction({
      type: "DISCARD_CARD",
      playerId: "",
      cardId: selectedCardId,
    } as GameAction);
  }, [selectedCardId, sendAction]);

  const drawFromDeck = useCallback(() => {
    sendAction({ type: "DRAW_FROM_DECK", playerId: "" } as GameAction);
  }, [sendAction]);

  const drawFromDiscard = useCallback(
    (color: CardColor) => {
      sendAction({
        type: "DRAW_FROM_DISCARD",
        playerId: "",
        color,
      } as GameAction);
    },
    [sendAction],
  );

  const isHost = room && playerId ? room.hostPlayerId === playerId : false;
  const isMyTurn = view ? view.currentPlayerId === playerId : false;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="layout">
      <h1>Kingdom Card Game</h1>

      <div data-testid="socket-status">
        {connState.status === "connected"
          ? `已连接 (${connState.id ?? ""})`
          : `未连接 — ${"reason" in connState ? connState.reason : connState.status}`}
      </div>
      <div style={{ fontSize: "0.75rem", opacity: 0.5 }}>Server: {SERVER_URL}</div>

      {error && (
        <div className="error" data-testid="error-message">
          ⚠ {error}
        </div>
      )}

      {/* ---------- 连接区 ---------- */}
      <section className="card">
        <h2>连接</h2>
        <div className="row">
          <label>
            昵称：
            <input
              data-testid="nickname-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入昵称"
            />
          </label>
        </div>
        <div className="row">
          <button data-testid="create-room-button" onClick={createRoom} disabled={!nickname}>
            创建房间
          </button>
          <label>
            房间号：
            <input
              data-testid="room-id-input"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="输入房间号"
            />
          </label>
          <button data-testid="join-room-button" onClick={joinRoom} disabled={!nickname || !roomIdInput}>
            加入房间
          </button>
          <button data-testid="leave-room-button" onClick={leaveRoom} disabled={!roomId}>
            离开房间
          </button>
        </div>
        {roomId && playerId && (
          <div className="row">
            <span data-testid="room-id-display">Room: {roomId}</span>
            <span data-testid="player-id-display">Player: {playerId}</span>
          </div>
        )}
      </section>

      {/* ---------- 房间区 ---------- */}
      {room && (
        <section className="card">
          <h2>房间</h2>
          <p>状态: {room.status}</p>
          <ul data-testid="member-list">
            {room.members.map((m) => (
              <li
                key={m.playerId}
                data-testid={`member-${m.playerId}`}
                data-connected={m.isConnected ? "true" : "false"}
              >
                {m.nickname}
                {m.isHost ? " [房主]" : ""}
                {m.isConnected ? "" : " [离线]"}
              </li>
            ))}
          </ul>
          {isHost && room.status === "waiting" && (
            <button data-testid="start-game-button" onClick={startGame}>
              开始游戏
            </button>
          )}
        </section>
      )}

      {/* ---------- 游戏区 ---------- */}
      {view && (
        <section className="card">
          <h2>游戏</h2>
          <p>
            <span data-testid="game-phase">
              阶段: {view.phase === "play" ? "出牌" : view.phase === "draw" ? "摸牌" : view.phase}
            </span>
            {view.phase !== "finished" && (
              <span data-testid="current-player">
                {" "}
                | 当前玩家: {view.currentPlayerId === playerId ? "你" : view.currentPlayerId}
              </span>
            )}
          </p>
          <p>
            牌堆剩余: <span data-testid="deck-count">{view.deckCount}</span>
          </p>

          {/* 其他玩家 */}
          <h3>其他玩家</h3>
          <div className="row">
            {view.players
              .filter((p) => p.id !== playerId)
              .map((p) => (
                <div key={p.id} className="card" data-testid={`other-player-${p.id}`}>
                  <strong>{p.nickname}</strong>
                  <div>手牌: {p.handCount} 张</div>
                  <div className="columns">
                    {Object.entries(p.columns).map(([c, col]) => (
                      <div key={c} className="column">
                        {COLOR_LABELS[c as CardColor]}:
                        {col.cards.length > 0
                          ? col.cards.map((pc) => formatCard(pc.card)).join(" ")
                          : " (空)"}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* 自己的手牌 */}
          <h3>我的手牌</h3>
          <div className="row" data-testid="hand-area">
            {sortHand(view.self.hand).map((card) => (
              <button
                key={card.id}
                data-testid={`card-button-${card.id}`}
                className={`card-btn ${selectedCardId === card.id ? "selected" : ""}`}
                onClick={() =>
                  setSelectedCardId(selectedCardId === card.id ? undefined : card.id)
                }
              >
                {formatCard(card)}
              </button>
            ))}
          </div>

          {/* 自己的颜色列 */}
          <h3>我的牌列</h3>
          <div className="columns">
            {Object.entries(view.self.columns).map(([c, col]) => (
              <div key={c} className="column">
                <strong>{COLOR_LABELS[c as CardColor]}</strong>:
                {col.cards.length > 0
                  ? col.cards.map((pc) => formatCard(pc.card)).join(" ")
                  : " (空)"}
                {view.phase === "play" && isMyTurn && (
                  <button
                    className="sm"
                    data-testid={`play-column-${c}`}
                    onClick={() => placeCard(c as CardColor)}
                  >
                    放这里
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          {view.phase === "play" && isMyTurn && (
            <div className="row">
              <button
                data-testid="discard-selected-button"
                onClick={discardCard}
                disabled={!selectedCardId}
              >
                弃置选中牌
              </button>
            </div>
          )}
          {view.phase === "draw" && isMyTurn && (
            <div className="row">
              <button data-testid="draw-deck-button" onClick={drawFromDeck}>
                从牌堆摸牌
              </button>
            </div>
          )}

          {/* 弃牌堆 */}
          <h3>弃牌堆</h3>
          <div className="columns">
            {Object.entries(view.discardPiles).map(([c, pile]) => (
              <div key={c} className="column">
                <strong>{COLOR_LABELS[c as CardColor]}</strong>:
                {pile.length > 0 ? formatCard(pile[pile.length - 1]!) : " (空)"}
                {view.phase === "draw" && isMyTurn && pile.length > 0 && (
                  <button
                    className="sm"
                    data-testid={`draw-discard-${c}`}
                    onClick={() => drawFromDiscard(c as CardColor)}
                  >
                    摸这张
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 事件日志 */}
          <h3>事件日志</h3>
          <div className="log" data-testid="event-log">
            {view.events
              .slice()
              .reverse()
              .map((e) => (
                <div key={e.id} className="log-item">
                  [{e.type}] {e.playerId ?? ""}
                  {e.type === "CARD_PLACED" && e.playerId
                    ? ` ${e.playerId} 放牌到${COLOR_LABELS[e.color as CardColor]}`
                    : ""}
                  {e.type === "CARD_DISCARDED" && e.playerId
                    ? ` ${e.playerId} 弃牌到${COLOR_LABELS[e.color as CardColor]}`
                    : ""}
                  {e.type === "CARD_DRAWN_FROM_DECK" && e.playerId
                    ? ` ${e.playerId} 从牌堆摸牌`
                    : ""}
                  {e.type === "CARD_DRAWN_FROM_DISCARD" && e.playerId
                    ? ` ${e.playerId} 从${COLOR_LABELS[e.color as CardColor]}弃牌堆摸牌`
                    : ""}
                  {e.type === "TURN_COMPLETED" && e.playerId
                    ? ` ${e.playerId} 回合结束`
                    : ""}
                  {e.type === "GAME_FINISHED" ? " 游戏结束" : ""}
                  {e.type === "PLAY_PHASE_SKIPPED" && e.playerId
                    ? ` ${e.playerId} 跳过出牌`
                    : ""}
                </div>
              ))}
          </div>

          {/* 最终排名 */}
          {view.finalResult && (
            <div>
              <h3>最终排名</h3>
              <ol>
                {view.finalResult.rankings.map((r) => (
                  <li key={r.playerId}>
                    {r.nickname}: {r.score} 分 (Rank {r.rank})
                    {r.isWinner ? " 🏆" : ""}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}