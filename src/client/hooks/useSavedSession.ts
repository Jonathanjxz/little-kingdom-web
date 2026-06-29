import type { PlayerId, RoomId } from "../../game/types";

const STORAGE_KEY = "kg-session";

export interface SavedSession {
  roomId: RoomId;
  playerId: PlayerId;
  sessionToken: string;
}

export function saveSession(session: SavedSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!parsed.roomId || !parsed.playerId || !parsed.sessionToken) return null;
    return parsed as SavedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
