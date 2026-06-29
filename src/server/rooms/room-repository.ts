/**
 * 内存房间仓库
 *
 * 基于 Map 的简单存储实现，供 RoomService 使用。
 * 测试时可通过 clear() 重置状态。
 */

import type { Room } from "./room-types";
import type { RoomId } from "../../game/types";

export class InMemoryRoomRepository {
  private readonly rooms = new Map<RoomId, Room>();

  create(room: Room): Room {
    this.rooms.set(room.roomId, room);
    return room;
  }

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  set(room: Room): Room {
    this.rooms.set(room.roomId, room);
    return room;
  }

  delete(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  clear(): void {
    this.rooms.clear();
  }
}