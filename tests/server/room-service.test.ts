/**
 * 房间服务 单元测试
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RoomError, RoomService } from "../../src/server/rooms/room-service";
import { toPublicRoomView } from "../../src/server/socket/protocol";
import type { PlayerId, RoomId } from "../../src/game/types";

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function pid(s: string): PlayerId {
  return s as PlayerId;
}
function rid(s: string): RoomId {
  return s as RoomId;
}

let svc: RoomService;

beforeEach(() => {
  svc = new RoomService();
});

// ---------------------------------------------------------------------------
// 创建房间
// ---------------------------------------------------------------------------

describe("创建房间", () => {
  it("可以创建房间", () => {
    const { room, playerId } = svc.createRoom({ nickname: "Alice" });
    expect(room.roomId).toBe(rid("room-1"));
    expect(playerId).toBe(pid("player-1"));
    expect(room.members).toHaveLength(1);
  });

  it("创建者成为房主", () => {
    const { room, playerId } = svc.createRoom({ nickname: "Alice" });
    expect(room.hostPlayerId).toBe(playerId);
    expect(room.members[0]!.isHost).toBe(true);
    expect(room.members[0]!.nickname).toBe("Alice");
  });

  it("创建后房间状态为 waiting", () => {
    const { room } = svc.createRoom({ nickname: "Alice" });
    expect(room.status).toBe("waiting");
  });

  it("创建后只有 1 个 member", () => {
    const { room } = svc.createRoom({ nickname: "Alice" });
    expect(room.members).toHaveLength(1);
  });

  it("createRoom 返回 sessionToken", () => {
    const { sessionToken } = svc.createRoom({ nickname: "Alice" });
    expect(sessionToken).toBeTruthy();
    expect(typeof sessionToken).toBe("string");
    expect(sessionToken.length).toBeGreaterThan(10);
  });

  it("PublicRoomView 不暴露 sessionToken（toPublicRoomView 不含该字段）", () => {
    const { room } = svc.createRoom({ nickname: "Alice" });
    const pub = toPublicRoomView(room);
    const pubMember = pub.members[0]!;
    expect("sessionToken" in pubMember).toBe(false);
  });

  it("默认使用 standard 限时模式", () => {
    const { room } = svc.createRoom({ nickname: "Alice" });
    expect(room.timeControl).toEqual({
      mode: "standard",
      baseSeconds: 20,
      extraSeconds: 50,
    });
  });

  it("可以创建无限时房间", () => {
    const { room } = svc.createRoom({
      nickname: "Alice",
      timeControlMode: "none",
    });
    expect(room.timeControl).toEqual({ mode: "none" });
  });

  it("可以创建宽松限时房间", () => {
    const { room } = svc.createRoom({
      nickname: "Alice",
      timeControlMode: "relaxed",
    });
    expect(room.timeControl).toEqual({
      mode: "relaxed",
      baseSeconds: 30,
      extraSeconds: 80,
    });
  });
});

// ---------------------------------------------------------------------------
// 加入房间
// ---------------------------------------------------------------------------

describe("加入房间", () => {
  it("第二名玩家可以加入房间", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { room: r2, playerId } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    expect(r2.members).toHaveLength(2);
    expect(playerId).toBe(pid("player-2"));
  });

  it("加入玩家不是房主", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { playerId } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.getRoom(r1.roomId)!;
    const bob = room.members.find((m) => m.playerId === playerId)!;
    expect(bob.isHost).toBe(false);
  });

  it("房间最多 4 人", () => {
    const { room: r1 } = svc.createRoom({ nickname: "A" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "B" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "C" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "D" });
    const room = svc.getRoom(r1.roomId)!;
    expect(room.members).toHaveLength(4);
  });

  it("第 5 人加入时抛出 ROOM_FULL", () => {
    const { room: r1 } = svc.createRoom({ nickname: "A" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "B" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "C" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "D" });
    expect(() => svc.joinRoom({ roomId: r1.roomId, nickname: "E" })).toThrow(RoomError);
    try {
      svc.joinRoom({ roomId: r1.roomId, nickname: "E" });
    } catch (e) {
      expect((e as RoomError).code).toBe("ROOM_FULL");
    }
  });

  it("游戏开始后不允许加入，抛出 ROOM_NOT_WAITING", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "A" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "B" });
    svc.startGame(r1.roomId, hostId);
    expect(() => svc.joinRoom({ roomId: r1.roomId, nickname: "C" })).toThrow(RoomError);
    try {
      svc.joinRoom({ roomId: r1.roomId, nickname: "C" });
    } catch (e) {
      expect((e as RoomError).code).toBe("ROOM_NOT_WAITING");
    }
  });

  it("joinRoom 返回 sessionToken", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { sessionToken } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    expect(sessionToken).toBeTruthy();
    expect(typeof sessionToken).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 退出房间
// ---------------------------------------------------------------------------

describe("退出房间", () => {
  it("游戏开始前玩家可以退出", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.leaveRoom(r1.roomId, p2Id);
    expect(room.members).toHaveLength(1);
    expect(room.members[0]!.nickname).toBe("Alice");
  });

  it("游戏开始前房主退出后，房主转移给下一位玩家", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const aliceId = r1.members[0]!.playerId;
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.leaveRoom(r1.roomId, aliceId);
    expect(room.hostPlayerId).toBe(p2Id);
    expect(room.members[0]!.isHost).toBe(true);
    expect(room.members[0]!.nickname).toBe("Bob");
  });

  it("游戏开始前最后一个玩家退出后，房间被删除", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.leaveRoom(r1.roomId, hostId);
    expect(svc.getRoom(r1.roomId)).toBeUndefined();
  });

  it("游戏开始后退出不会移除成员，只会标记 disconnected", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    const room = svc.leaveRoom(r1.roomId, p2Id);
    expect(room.members).toHaveLength(2);
    const bob = room.members.find((m) => m.playerId === p2Id)!;
    expect(bob.isConnected).toBe(false);
  });

  it("游戏开始后退出会同步 gameState.players[].isConnected = false", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    svc.leaveRoom(r1.roomId, p2Id);
    const room = svc.getRoom(r1.roomId)!;
    const bobGS = room.gameState!.players.find((p) => p.id === p2Id)!;
    expect(bobGS.isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 断线
// ---------------------------------------------------------------------------

describe("断线 disconnect", () => {
  it("disconnect 不移除 waiting member，只标记离线", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.disconnect(r1.roomId, p2Id);
    expect(room.members).toHaveLength(2);
    const bob = room.members.find((m) => m.playerId === p2Id)!;
    expect(bob.isConnected).toBe(false);
  });

  it("disconnect 会同步 gameState.players[].isConnected = false", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    expect(hostId).toBeTruthy(); // sanity
    svc.disconnect(r1.roomId, p2Id);
    const room = svc.getRoom(r1.roomId)!;
    const bobGS = room.gameState!.players.find((p) => p.id === p2Id)!;
    expect(bobGS.isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 重连
// ---------------------------------------------------------------------------

describe("重连", () => {
  it("断线玩家可以重连（必须携带正确 sessionToken）", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id, sessionToken: token2 } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    svc.disconnect(r1.roomId, p2Id);
    const room = svc.reconnect({ roomId: r1.roomId, playerId: p2Id, sessionToken: token2 });
    const bob = room.members.find((m) => m.playerId === p2Id)!;
    expect(bob.isConnected).toBe(true);
  });

  it("重连后 member 和 gameState player 都恢复 isConnected = true", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id, sessionToken: token2 } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    svc.disconnect(r1.roomId, p2Id);
    svc.reconnect({ roomId: r1.roomId, playerId: p2Id, sessionToken: token2 });
    const room = svc.getRoom(r1.roomId)!;
    const bobMember = room.members.find((m) => m.playerId === p2Id)!;
    const bobGS = room.gameState!.players.find((p) => p.id === p2Id)!;
    expect(bobMember.isConnected).toBe(true);
    expect(bobGS.isConnected).toBe(true);
  });

  it("不存在的玩家重连抛出 PLAYER_NOT_FOUND", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { sessionToken: token2 } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    expect(() =>
      svc.reconnect({ roomId: r1.roomId, playerId: pid("player-nonexistent"), sessionToken: token2 }),
    ).toThrow(RoomError);
    try {
      svc.reconnect({ roomId: r1.roomId, playerId: pid("player-nonexistent"), sessionToken: token2 });
    } catch (e) {
      expect((e as RoomError).code).toBe("PLAYER_NOT_FOUND");
    }
  });

  it("错误 token reconnect 返回 INVALID_SESSION", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    expect(() =>
      svc.reconnect({ roomId: r1.roomId, playerId: p2Id, sessionToken: "wrong-token" }),
    ).toThrow(RoomError);
    try {
      svc.reconnect({ roomId: r1.roomId, playerId: p2Id, sessionToken: "wrong-token" });
    } catch (e) {
      expect((e as RoomError).code).toBe("INVALID_SESSION");
    }
  });
});

// ---------------------------------------------------------------------------
// 会话验证
// ---------------------------------------------------------------------------

describe("会话验证 verifySession", () => {
  it("verifySession 正确接受合法 token", () => {
    const { room: r1, sessionToken } = svc.createRoom({ nickname: "Alice" });
    const member = svc.verifySession(r1.roomId, pid("player-1"), sessionToken);
    expect(member.playerId).toBe(pid("player-1"));
  });

  it("verifySession 拒绝错误 token，抛 INVALID_SESSION", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    expect(() =>
      svc.verifySession(r1.roomId, pid("player-1"), "wrong"),
    ).toThrow(RoomError);
    try {
      svc.verifySession(r1.roomId, pid("player-1"), "wrong");
    } catch (e) {
      expect((e as RoomError).code).toBe("INVALID_SESSION");
    }
  });
});

// ---------------------------------------------------------------------------
// 开始游戏
// ---------------------------------------------------------------------------

describe("开始游戏", () => {
  it("房主可以在 2-4 人时开始游戏", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.startGame(r1.roomId, hostId);
    expect(room.status).toBe("playing");
  });

  it("3 人也可以开始游戏", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Charlie" });
    const room = svc.startGame(r1.roomId, hostId);
    expect(room.status).toBe("playing");
  });

  it("4 人也可以开始游戏", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Charlie" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Diana" });
    const room = svc.startGame(r1.roomId, hostId);
    expect(room.status).toBe("playing");
  });

  it("非房主不能开始游戏，抛出 NOT_HOST", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    expect(() => svc.startGame(r1.roomId, p2Id)).toThrow(RoomError);
    try {
      svc.startGame(r1.roomId, p2Id);
    } catch (e) {
      expect((e as RoomError).code).toBe("NOT_HOST");
    }
  });

  it("只有 1 人时不能开始游戏，抛出 INVALID_ROOM_PLAYER_COUNT", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    expect(() => svc.startGame(r1.roomId, hostId)).toThrow(RoomError);
    try {
      svc.startGame(r1.roomId, hostId);
    } catch (e) {
      expect((e as RoomError).code).toBe("INVALID_ROOM_PLAYER_COUNT");
    }
  });

  it("开始游戏后 room.status 为 playing", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.startGame(r1.roomId, hostId);
    expect(room.status).toBe("playing");
  });

  it("开始游戏后 room.gameState 存在", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    const room = svc.startGame(r1.roomId, hostId);
    expect(room.gameState).toBeDefined();
  });

  it("gameState 中玩家 ID 与 room members 一致", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Charlie" });
    const room = svc.startGame(r1.roomId, hostId);
    const gsPlayerIds = room.gameState!.players.map((p) => p.id);
    const memberIds = room.members.map((m) => m.playerId);
    expect(gsPlayerIds.sort()).toEqual(memberIds.sort());
  });

  it("gameState 每名玩家初始 8 张手牌", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Charlie" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Diana" });
    const room = svc.startGame(r1.roomId, hostId);
    for (const p of room.gameState!.players) {
      expect(p.hand).toHaveLength(8);
    }
  });
});

// ---------------------------------------------------------------------------
// 玩家视角
// ---------------------------------------------------------------------------

describe("玩家视角", () => {
  it("getPlayerView 返回玩家视角", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    const view = svc.getPlayerView(r1.roomId, hostId);
    expect(view.self.nickname).toBe("Alice");
    expect(view.players).toHaveLength(2);
  });

  it("玩家视角中自己有完整 hand", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    const view = svc.getPlayerView(r1.roomId, hostId);
    expect(view.self.hand.length).toBe(8);
  });

  it("玩家视角中其他玩家只有 handCount", () => {
    const { room: r1, playerId: hostId } = svc.createRoom({ nickname: "Alice" });
    const { playerId: p2Id } = svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    svc.startGame(r1.roomId, hostId);
    const view = svc.getPlayerView(r1.roomId, hostId);
    const bobView = view.players.find((p) => p.id === p2Id)!;
    expect("hand" in bobView).toBe(false);
    expect(bobView.handCount).toBe(8);
  });

  it("游戏未开始时调用 getPlayerView 抛出 GAME_NOT_STARTED", () => {
    const { room: r1 } = svc.createRoom({ nickname: "Alice" });
    svc.joinRoom({ roomId: r1.roomId, nickname: "Bob" });
    expect(() => svc.getPlayerView(r1.roomId, pid("player-1"))).toThrow(RoomError);
    try {
      svc.getPlayerView(r1.roomId, pid("player-1"));
    } catch (e) {
      expect((e as RoomError).code).toBe("GAME_NOT_STARTED");
    }
  });
});
