/**
 * Socket.IO 集成测试
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server as HttpServer } from "node:http";
import { io as createClient, Socket } from "socket.io-client";
import type { Server as IOServer } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectPayload,
  RoomPayload,
  GameViewPayload,
} from "../../src/server/socket/protocol";
import type { PlayerGameView } from "../../src/game/view";
import { createSocketServer } from "../../src/server/server";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let io: IOServer;
let port: number;
let url: string;

beforeEach(async () => {
  const created = createSocketServer();
  httpServer = created.httpServer;
  io = created.io;

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const addr = httpServer.address();
  if (addr && typeof addr === "object") {
    port = addr.port;
  } else {
    port = 0;
  }
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function newClient(): TestSocket {
  return createClient(url, { transports: ["websocket"] }) as TestSocket;
}

function waitForEvent<T>(socket: TestSocket, event: string, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Event "${event}" timeout`)), timeout);
    // @ts-expect-error Socket.IO dynamic event
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function createRoomAndGet(c: TestSocket) {
  const ack = await new Promise<SocketAck<CreateRoomPayload>>((r) => {
    c.emit("room:create", { nickname: "Alice" }, r);
  });
  return ack.data!;
}

async function joinRoomAndGet(c: TestSocket, roomId: string) {
  const ack = await new Promise<SocketAck<JoinRoomPayload>>((r) => {
    c.emit("room:join", { roomId: roomId as any, nickname: "Bob" }, r);
  });
  return ack.data!;
}

// ---------------------------------------------------------------------------
// 房间
// ---------------------------------------------------------------------------

describe("房间 create/join", () => {
  it("room:create ack 返回 sessionToken", async () => {
    const c = newClient();
    const data = await createRoomAndGet(c);
    expect(data.sessionToken).toBeTruthy();
    c.disconnect();
  });

  it("room:join ack 返回 sessionToken", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    const d2 = await joinRoomAndGet(c2, d1.room.roomId);
    expect(d2.sessionToken).toBeTruthy();
    c1.disconnect();
    c2.disconnect();
  });

  it("PublicRoomView 不包含 sessionToken", async () => {
    const c = newClient();
    const data = await createRoomAndGet(c);
    const m = data.room.members[0]!;
    expect("sessionToken" in m).toBe(false);
    c.disconnect();
  });

  it("room:create 和 room:updated 返回 timeControl", async () => {
    const c = newClient();
    const updated = waitForEvent<RoomPayload>(c, "room:updated");
    const ack = await new Promise<SocketAck<CreateRoomPayload>>((resolve) => {
      c.emit("room:create", {
        nickname: "Alice",
        timeControlMode: "relaxed",
      }, resolve);
    });

    expect(ack.data!.room.timeControl).toEqual({
      mode: "relaxed",
      baseSeconds: 30,
      extraSeconds: 80,
    });
    expect((await updated).room.timeControl.mode).toBe("relaxed");
    c.disconnect();
  });

  it("ROOM_FULL works", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const helpers: TestSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const c = newClient();
      await joinRoomAndGet(c, d1.room.roomId);
      helpers.push(c);
    }
    const c5 = newClient();
    const ack5 = await new Promise<SocketAck<unknown>>((r) => {
      c5.emit("room:join", { roomId: d1.room.roomId as any, nickname: "P5" }, r);
    });
    expect(ack5.ok).toBe(false);
    expect(ack5.error?.code).toBe("ROOM_FULL");
    c1.disconnect();
    helpers.forEach((c) => c.disconnect());
    c5.disconnect();
  });
});

// ---------------------------------------------------------------------------
// game:start
// ---------------------------------------------------------------------------

describe("game:start", () => {
  it("房主可以 game:start（使用 socket.data，不传 playerId）", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    await joinRoomAndGet(c2, d1.room.roomId);
    const ack = await new Promise<SocketAck<RoomPayload>>((r) => {
      c1.emit("game:start", {}, r);
    });
    expect(ack.ok).toBe(true);
    expect(ack.data!.room.status).toBe("playing");
    c1.disconnect();
    c2.disconnect();
  });

  it("非房主 game:start 返回 NOT_HOST", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    await joinRoomAndGet(c2, d1.room.roomId);
    const ack = await new Promise<SocketAck<RoomPayload>>((r) => {
      c2.emit("game:start", {}, r);
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("NOT_HOST");
    c1.disconnect();
    c2.disconnect();
  });

  it("未认证 socket 调用 game:start 返回 INVALID_SESSION", async () => {
    const c = newClient();
    const ack = await new Promise<SocketAck<RoomPayload>>((r) => {
      c.emit("game:start", {}, r);
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("INVALID_SESSION");
    c.disconnect();
  });
});

// ---------------------------------------------------------------------------
// 重连
// ---------------------------------------------------------------------------

describe("room:reconnect", () => {
  it("reconnect 必须携带 sessionToken", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    const d2 = await joinRoomAndGet(c2, d1.room.roomId);

    // Start game so reconnect gets views
    await new Promise<SocketAck<RoomPayload>>((r) => c1.emit("game:start", {}, r));
    c2.disconnect();

    const c2b = newClient();
    const ack = await new Promise<SocketAck<ReconnectPayload>>((r) => {
      c2b.emit("room:reconnect", {
        roomId: d1.room.roomId as any,
        playerId: d2.playerId,
        sessionToken: d2.sessionToken,
      }, r);
    });
    expect(ack.ok).toBe(true);
    expect(ack.data!.view).toBeDefined();
    expect(ack.data!.view!.self.hand).toHaveLength(8);
    expect(ack.data!.timer?.mode).toBe("standard");
    expect(ack.data!.timer?.deadlineAt).toBeGreaterThan(
      ack.data!.timer!.serverNow,
    );
    c1.disconnect();
    c2b.disconnect();
  });

  it("错误 token reconnect 返回 INVALID_SESSION", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    const d2 = await joinRoomAndGet(c2, d1.room.roomId);
    await new Promise<SocketAck<RoomPayload>>((r) => c1.emit("game:start", {}, r));
    const ack = await new Promise<SocketAck<ReconnectPayload>>((r) => {
      c2.emit("room:reconnect", {
        roomId: d1.room.roomId as any,
        playerId: d2.playerId,
        sessionToken: "wrong",
      }, r);
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("INVALID_SESSION");
    c1.disconnect();
    c2.disconnect();
  });
});

// ---------------------------------------------------------------------------
// 游戏动作
// ---------------------------------------------------------------------------

describe("game:action", () => {
  /** Setup 2P game, return socket info */
  async function setup2P() {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    const d2 = await joinRoomAndGet(c2, d1.room.roomId);
    const v1p = waitForEvent<GameViewPayload>(c1, "game:view");
    const v2p = waitForEvent<GameViewPayload>(c2, "game:view");
    c1.emit("game:start", {}, () => {});
    const v1 = await v1p;
    const v2 = await v2p;
    const cpId = v1.view.currentPlayerId!;
    const cpSock = cpId === d1.playerId ? c1 : c2;
    const otherSock = cpSock === c1 ? c2 : c1;
    const cpView = cpSock === c1 ? v1 : v2;
    return { roomId: d1.room.roomId, c1, c2, d1, d2, cpId, cpSock, otherSock, cpView };
  }

  it("game:view 返回服务端 timer", async () => {
    const { cpView, c1, c2 } = await setup2P();
    expect(cpView.timer.mode).toBe("standard");
    expect(cpView.timer.phase).toBe("play");
    expect(cpView.timer.deadlineAt).toBeGreaterThan(cpView.timer.serverNow);
    c1.disconnect();
    c2.disconnect();
  });

  it("当前玩家可以发送 game:action（不传 roomId/playerId）", async () => {
    const { cpId, cpSock, cpView, c1, c2 } = await setup2P();
    const card = cpView.view.self.hand[0]!;
    const color = card.type === "wild" ? "red" : card.color;
    const ack = await new Promise<SocketAck<{ view: PlayerGameView }>>((r) => {
      cpSock.emit("game:action", {
        action: { type: "PLACE_CARD", playerId: cpId, cardId: card.id, color } as any,
      }, r);
    });
    // Server overrides playerId, so it should succeed
    expect(ack.ok).toBe(true);
    c1.disconnect();
    c2.disconnect();
  });

  it("服务端覆盖 action.playerId（伪造 playerId 不能替别人行动）", async () => {
    // Non-current player tries to send action with wrong playerId
    const { otherSock, d1, d2, c1, c2 } = await setup2P();
    const nonCpId = otherSock === c1 ? d1.playerId : d2.playerId;
    const ack = await new Promise<SocketAck<{ view: PlayerGameView }>>((r) => {
      otherSock.emit("game:action", {
        action: { type: "PLACE_CARD", playerId: nonCpId, cardId: "fake-card" as any, color: "red" } as any,
      }, r);
    });
    // NOT_CURRENT_PLAYER from rule engine (the server overrides playerId with socket.data.playerId)
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("NOT_CURRENT_PLAYER");
    c1.disconnect();
    c2.disconnect();
  });

  it("/healthz 返回 200 和 { ok: true }", async () => {
    const resp = await fetch(`${url}/healthz`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({ ok: true });
  });

  it("socket disconnect 后另一玩家收到 room:updated 看到离线", async () => {
    const c1 = newClient();
    const d1 = await createRoomAndGet(c1);
    const c2 = newClient();
    await joinRoomAndGet(c2, d1.room.roomId);

    const c1ViewP = waitForEvent<{ view: PlayerGameView }>(c1, "game:view");
    const c2ViewP = waitForEvent<{ view: PlayerGameView }>(c2, "game:view");
    await new Promise<SocketAck<RoomPayload>>((r) => c1.emit("game:start", {}, r));
    await c1ViewP;
    await c2ViewP;

    const updatePromise = waitForEvent<RoomPayload>(c1, "room:updated");
    c2.disconnect();
    const payload = await updatePromise;
    const bobMember = payload.room.members.find((m) => m.nickname === "Bob")!;
    expect(bobMember.isConnected).toBe(false);
    c1.disconnect();
  });
});
