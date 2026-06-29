/**
 * Socket.IO 服务端入口
 *
 * 支持两种模式：
 * - 开发：仅 Socket.IO（前端由 Vite dev server 提供）
 * - 生产：Socket.IO + 静态文件服务（前端 build 产物 dist/）
 *
 * 可通过 `tsx src/server/server.ts` 直接启动。
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./socket/protocol";
import type { RoomService } from "./rooms/room-service";
import { RoomService as RoomServiceImpl } from "./rooms/room-service";
import { registerSocketHandlers } from "./socket/handlers";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function createSocketServer() {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });

  const roomService: RoomService = new RoomServiceImpl();
  registerSocketHandlers(io, roomService);
  httpServer.on("close", () => roomService.dispose());

  // Health check endpoint (always available)
  httpServer.on("request", (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }
  });

  return { httpServer, io, roomService };
}

// ---------------------------------------------------------------------------
// Production static file serving
// ---------------------------------------------------------------------------

function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
): boolean {
  const rawUrl = req.url ?? "/";
  const host = req.headers.host ?? "localhost";
  const url = new URL(rawUrl, `http://${host}`);
  let filePath = join(distDir, url.pathname);
  if (url.pathname === "/" || !extname(filePath)) {
    filePath = join(distDir, "index.html");
  }
  if (!filePath.startsWith(distDir)) return false;

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";
  const content = readFileSync(filePath);
  res.writeHead(200, { "Content-Type": mime });
  res.end(content);
  return true;
}

// ---------------------------------------------------------------------------
// Direct run
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  const { httpServer } = createSocketServer();
  const distDir = resolve(fileURLToPath(import.meta.url), "../../../dist");

  // Production mode: serve dist/ static files
  if (existsSync(distDir)) {
    httpServer.on("request", (req, res) => {
      if (req.url === "/healthz") return; // already handled in createSocketServer
      if (!serveStaticFile(req, res, distDir)) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
  }

  httpServer.listen(port, "0.0.0.0", () => {
    const mode = existsSync(distDir) ? "production" : "development";
    console.log(
      `Kingdom Card Game server (${mode}) listening on http://0.0.0.0:${port}`,
    );
  });
}
