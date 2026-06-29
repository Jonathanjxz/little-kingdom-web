import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerId } from "../../game/types";
import type { PlayerGameView } from "../../game/view";

const STORAGE_KEY = "kg-sound-enabled";

type SoundName = "turn" | "warning" | "action" | "timeout" | "finished";

function readSavedSetting(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function useSoundEffects(
  view: PlayerGameView,
  playerId: PlayerId | undefined,
  remainingSeconds: number | undefined,
) {
  const [enabled, setEnabled] = useState(readSavedSetting);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const previousPlayerId = useRef(view.currentPlayerId);
  const previousRemaining = useRef(remainingSeconds);
  const processedEventCount = useRef(view.events.length);

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const play = useCallback((sound: SoundName) => {
    if (!enabled) return;
    const context = ensureContext();
    const patterns: Record<SoundName, Array<[number, number, number]>> = {
      turn: [[520, 0, 0.08], [720, 0.1, 0.12]],
      warning: [[880, 0, 0.08], [880, 0.16, 0.08]],
      action: [[420, 0, 0.06], [560, 0.06, 0.08]],
      timeout: [[220, 0, 0.14], [170, 0.16, 0.18]],
      finished: [[392, 0, 0.12], [523, 0.13, 0.12], [659, 0.27, 0.22]],
    };

    for (const [frequency, offset, duration] of patterns[sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + offset;
      oscillator.type = sound === "timeout" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.07, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    }
  }, [enabled, ensureContext]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (next) {
      ensureContext();
    }
  }, [enabled, ensureContext]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => ensureContext();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [enabled, ensureContext]);

  useEffect(() => {
    if (
      previousPlayerId.current !== view.currentPlayerId &&
      view.currentPlayerId === playerId
    ) {
      play("turn");
    }
    previousPlayerId.current = view.currentPlayerId;
  }, [play, playerId, view.currentPlayerId]);

  useEffect(() => {
    const previous = previousRemaining.current;
    if (
      remainingSeconds !== undefined &&
      remainingSeconds <= 5 &&
      (previous === undefined || previous > 5) &&
      view.currentPlayerId === playerId
    ) {
      play("warning");
    }
    previousRemaining.current = remainingSeconds;
  }, [play, playerId, remainingSeconds, view.currentPlayerId]);

  useEffect(() => {
    const newEvents = view.events.slice(processedEventCount.current);
    processedEventCount.current = view.events.length;
    if (newEvents.some((event) => event.type === "GAME_FINISHED")) {
      play("finished");
      return;
    }
    if (newEvents.some((event) => event.type === "TURN_TIMED_OUT")) {
      play("timeout");
      return;
    }
    if (newEvents.some((event) =>
      event.playerId === playerId && (
        event.type === "CARD_PLACED" ||
        event.type === "CARD_DISCARDED" ||
        event.type === "CARD_DRAWN_FROM_DECK" ||
        event.type === "CARD_DRAWN_FROM_DISCARD"
      ))) {
      play("action");
    }
  }, [play, playerId, view.events]);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  return { enabled, toggle };
}
