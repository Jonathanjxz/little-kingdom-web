import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardColor, GameAction } from "../../src/game/types";
import { RoomService } from "../../src/server/rooms/room-service";

describe("RoomService authoritative turn timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function startTwoPlayerGame(mode: "none" | "standard" | "relaxed") {
    const service = new RoomService(undefined, { now: () => Date.now() });
    const host = service.createRoom({
      nickname: "Alice",
      timeControlMode: mode,
    });
    service.joinRoom({ roomId: host.room.roomId, nickname: "Bob" });
    const room = service.startGame(host.room.roomId, host.playerId);
    return { service, host, room };
  }

  function playFirstCard(
    service: RoomService,
    room: ReturnType<RoomService["startGame"]>,
  ) {
    const playerId = room.gameState!.currentPlayerId!;
    const player = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    const card = player.hand[0]!;
    const color: CardColor = card.type === "wild" ? "red" : card.color;
    service.applyGameActionToRoom(room.roomId, playerId, {
      type: "PLACE_CARD",
      playerId,
      cardId: card.id,
      color,
    });
    return playerId;
  }

  it("standard starts a server-authoritative play timer", () => {
    const { service, room } = startTwoPlayerGame("standard");
    expect(room.timerState).toEqual({
      playerId: room.gameState!.currentPlayerId,
      phase: "play",
      startedAt: 1_000,
      deadlineAt: 71_000,
    });
    expect(service.getTimerView(room.roomId)).toMatchObject({
      mode: "standard",
      phase: "play",
      serverNow: 1_000,
      baseSeconds: 20,
      extraRemainingSeconds: 50,
    });
    service.clear();
  });

  it("none mode does not start a timer", () => {
    const { service, room } = startTwoPlayerGame("none");
    expect(room.timerState).toBeUndefined();
    expect(service.getTimerView(room.roomId)).toEqual({
      mode: "none",
      serverNow: 1_000,
    });
    service.clear();
  });

  it("a valid play action starts a draw-phase timer", () => {
    const { service, room } = startTwoPlayerGame("relaxed");
    const currentPlayerId = room.gameState!.currentPlayerId!;
    const player = room.gameState!.players.find(
      (candidate) => candidate.id === currentPlayerId,
    )!;
    const card = player.hand[0]!;
    const color: CardColor = card.type === "wild" ? "red" : card.color;
    const action: GameAction = {
      type: "PLACE_CARD",
      playerId: currentPlayerId,
      cardId: card.id,
      color,
    };

    vi.setSystemTime(5_000);
    service.applyGameActionToRoom(room.roomId, currentPlayerId, action);

    expect(room.timerState).toEqual({
      playerId: currentPlayerId,
      phase: "draw",
      startedAt: 5_000,
      deadlineAt: 115_000,
    });
    service.clear();
  });

  it("disconnect and reconnect do not reset the current deadline", () => {
    const { service, host, room } = startTwoPlayerGame("standard");
    const deadlineAt = room.timerState!.deadlineAt;

    vi.setSystemTime(15_000);
    service.disconnect(room.roomId, host.playerId);
    service.reconnect({
      roomId: room.roomId,
      playerId: host.playerId,
      sessionToken: host.sessionToken,
    });

    expect(room.timerState!.deadlineAt).toBe(deadlineAt);
    expect(service.getTimerView(room.roomId).serverNow).toBe(15_000);
    service.clear();
  });

  it("play timeout discards the first non-wild card and enters draw", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = room.gameState!.currentPlayerId!;

    vi.advanceTimersByTime(70_000);

    const player = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(room.gameState!.phase).toBe("draw");
    expect(player.hand).toHaveLength(7);
    expect(player.extraTimeRemainingSeconds).toBe(0);
    expect(room.gameState!.events.some(
      (event) => event.type === "TURN_TIMED_OUT",
    )).toBe(true);
    expect(room.gameState!.events.some(
      (event) => event.type === "AUTO_ACTION_APPLIED",
    )).toBe(true);
    service.clear();
  });

  it("draw timeout draws from deck and advances to the next player", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = playFirstCard(service, room);

    vi.advanceTimersByTime(70_000);

    expect(room.gameState!.phase).toBe("play");
    expect(room.gameState!.currentPlayerId).not.toBe(playerId);
    const previousPlayer = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(previousPlayer.hand).toHaveLength(8);
    service.clear();
  });

  it("disconnect does not pause timeout progression", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = room.gameState!.currentPlayerId!;
    service.disconnect(room.roomId, playerId);

    vi.advanceTimersByTime(70_000);

    expect(room.gameState!.phase).toBe("draw");
    service.clear();
  });

  it("an action within base time does not consume extra time", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = room.gameState!.currentPlayerId!;
    vi.setSystemTime(11_000);

    playFirstCard(service, room);

    const player = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(player.extraTimeRemainingSeconds).toBe(50);
    service.clear();
  });

  it("an action after base time consumes rounded-up overtime seconds", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = room.gameState!.currentPlayerId!;
    vi.setSystemTime(24_200);

    playFirstCard(service, room);

    const player = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(player.extraTimeRemainingSeconds).toBe(46);
    expect(room.timerState!.deadlineAt).toBe(90_200);
    service.clear();
  });

  it("an invalid action does not consume extra time", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = room.gameState!.currentPlayerId!;
    vi.setSystemTime(24_200);

    expect(() =>
      service.applyGameActionToRoom(room.roomId, playerId, {
        type: "DRAW_FROM_DECK",
        playerId,
      }),
    ).toThrow();

    const player = room.gameState!.players.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(player.extraTimeRemainingSeconds).toBe(50);
    expect(room.timerState!.startedAt).toBe(1_000);
    service.clear();
  });

  it("finishing the game clears the timer", () => {
    const { service, room } = startTwoPlayerGame("standard");
    const playerId = playFirstCard(service, room);
    room.gameState!.deck = room.gameState!.deck.slice(0, 1);

    service.applyGameActionToRoom(room.roomId, playerId, {
      type: "DRAW_FROM_DECK",
      playerId,
    });

    expect(room.status).toBe("finished");
    expect(room.timerState).toBeUndefined();
    service.clear();
  });
});
