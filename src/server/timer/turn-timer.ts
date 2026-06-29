import type { RoomId } from "../../game/types";

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface TurnTimerDependencies {
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

/** Owns one scheduled timeout per room. */
export class TurnTimer {
  private readonly handles = new Map<RoomId, TimerHandle>();
  private readonly schedule: typeof setTimeout;
  private readonly cancel: typeof clearTimeout;

  constructor(dependencies: TurnTimerDependencies = {}) {
    this.schedule = dependencies.setTimeout ?? setTimeout;
    this.cancel = dependencies.clearTimeout ?? clearTimeout;
  }

  start(roomId: RoomId, delayMs: number, onTimeout: () => void): void {
    this.clear(roomId);
    const handle = this.schedule(onTimeout, Math.max(0, delayMs));
    handle.unref?.();
    this.handles.set(roomId, handle);
  }

  clear(roomId: RoomId): void {
    const handle = this.handles.get(roomId);
    if (handle !== undefined) {
      this.cancel(handle);
      this.handles.delete(roomId);
    }
  }

  clearAll(): void {
    for (const roomId of this.handles.keys()) {
      this.clear(roomId);
    }
  }
}
