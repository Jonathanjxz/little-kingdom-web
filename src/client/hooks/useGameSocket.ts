import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, CardColor, GameAction, PlayerId, RoomId } from "../../game/types";
import type { PlayerGameView } from "../../game/view";
import type {
  GameViewPayload,
  PublicRoomView,
} from "../../server/socket/protocol";
import type { TimeControlMode } from "../../server/timer/time-control";
import { getConnectionState, socket } from "../socket";
import type { SocketConnectionState } from "../socket";
import {
  clearSession,
  loadSession,
  saveSession,
} from "./useSavedSession";
import type { TimerSnapshot } from "./useServerTimer";

export function useGameSocket() {
  const [roomId, setRoomId] = useState<RoomId>();
  const [playerId, setPlayerId] = useState<PlayerId>();
  const [room, setRoom] = useState<PublicRoomView>();
  const [view, setView] = useState<PlayerGameView>();
  const [timerSnapshot, setTimerSnapshot] = useState<TimerSnapshot>();
  const [selectedCardId, setSelectedCardId] = useState<Card["id"]>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [connectionState, setConnectionState] =
    useState<SocketConnectionState>({ status: "connecting" });
  const restoredSocketId = useRef<string | undefined>(undefined);

  const resetGame = useCallback(() => {
    setRoomId(undefined);
    setPlayerId(undefined);
    setRoom(undefined);
    setView(undefined);
    setTimerSnapshot(undefined);
    setSelectedCardId(undefined);
  }, []);

  useEffect(() => {
    const onRoomUpdated = (payload: { room: PublicRoomView }) =>
      setRoom(payload.room);
    const onGameView = (payload: GameViewPayload) => {
      setView(payload.view);
      setTimerSnapshot({ timer: payload.timer, receivedAt: Date.now() });
    };

    socket.on("room:updated", onRoomUpdated);
    socket.on("game:view", onGameView);
    const tearDownConnection = getConnectionState(setConnectionState);

    return () => {
      socket.off("room:updated", onRoomUpdated);
      socket.off("game:view", onGameView);
      tearDownConnection();
    };
  }, []);

  useEffect(() => {
    const reconnectSavedSession = () => {
      const socketId = socket.id;
      if (!socketId || restoredSocketId.current === socketId) return;
      const saved = loadSession();
      if (!saved) return;

      restoredSocketId.current = socketId;
      setPending("reconnect");
      socket.emit("room:reconnect", saved, (ack) => {
        setPending(undefined);
        if (!ack.ok) {
          setError(`恢复会话失败：${ack.error?.code ?? "UNKNOWN_ERROR"}`);
          if (ack.error?.code === "INVALID_SESSION") {
            clearSession();
            resetGame();
          }
          return;
        }

        setError(undefined);
        setRoomId(saved.roomId);
        setPlayerId(saved.playerId);
        setRoom(ack.data!.room);
        setView(ack.data!.view);
        if (ack.data!.timer) {
          setTimerSnapshot({
            timer: ack.data!.timer,
            receivedAt: Date.now(),
          });
        }
      });
    };

    socket.on("connect", reconnectSavedSession);
    if (socket.connected) reconnectSavedSession();
    return () => {
      socket.off("connect", reconnectSavedSession);
    };
  }, [resetGame]);

  const createRoom = useCallback((
    nickname: string,
    timeControlMode: TimeControlMode,
  ) => {
    setPending("create");
    socket.emit("room:create", { nickname, timeControlMode }, (ack) => {
      setPending(undefined);
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      const data = ack.data!;
      setError(undefined);
      setRoomId(data.room.roomId);
      setPlayerId(data.playerId);
      setRoom(data.room);
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
    });
  }, []);

  const joinRoom = useCallback((nickname: string, targetRoomId: string) => {
    setPending("join");
    socket.emit("room:join", {
      roomId: targetRoomId.trim() as RoomId,
      nickname,
    }, (ack) => {
      setPending(undefined);
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      const data = ack.data!;
      setError(undefined);
      setRoomId(data.room.roomId);
      setPlayerId(data.playerId);
      setRoom(data.room);
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    setPending("leave");
    socket.emit("room:leave", {}, (ack) => {
      setPending(undefined);
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      clearSession();
      setError(undefined);
      resetGame();
    });
  }, [resetGame]);

  const startGame = useCallback(() => {
    setPending("start");
    socket.emit("game:start", {}, (ack) => {
      setPending(undefined);
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
    });
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    setPending("action");
    socket.emit("game:action", { action }, (ack) => {
      setPending(undefined);
      if (!ack.ok) {
        setError(`${ack.error?.code}: ${ack.error?.message}`);
        return;
      }
      setError(undefined);
      setSelectedCardId(undefined);
      setView(ack.data!.view);
      setTimerSnapshot({ timer: ack.data!.timer, receivedAt: Date.now() });
    });
  }, []);

  const placeCard = useCallback((color: CardColor) => {
    if (!selectedCardId) return;
    sendAction({
      type: "PLACE_CARD",
      playerId: "" as PlayerId,
      cardId: selectedCardId,
      color,
    });
  }, [selectedCardId, sendAction]);

  const discardSelectedCard = useCallback(() => {
    if (!selectedCardId) return;
    sendAction({
      type: "DISCARD_CARD",
      playerId: "" as PlayerId,
      cardId: selectedCardId,
    });
  }, [selectedCardId, sendAction]);

  const drawFromJobPool = useCallback(() => {
    sendAction({
      type: "DRAW_FROM_DECK",
      playerId: "" as PlayerId,
    });
  }, [sendAction]);

  const drawFromTalentMarket = useCallback((color: CardColor) => {
    sendAction({
      type: "DRAW_FROM_DISCARD",
      playerId: "" as PlayerId,
      color,
    });
  }, [sendAction]);

  return {
    roomId,
    playerId,
    room,
    view,
    timerSnapshot,
    selectedCardId,
    setSelectedCardId,
    error,
    setError,
    pending,
    connectionState,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    placeCard,
    discardSelectedCard,
    drawFromJobPool,
    drawFromTalentMarket,
  };
}
