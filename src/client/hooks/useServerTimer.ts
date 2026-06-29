import { useEffect, useMemo, useState } from "react";
import type { PublicTimerView } from "../../server/rooms/room-types";

export interface TimerSnapshot {
  timer: PublicTimerView;
  receivedAt: number;
}

export function useServerTimer(snapshot?: TimerSnapshot) {
  const [clientNow, setClientNow] = useState(() => Date.now());

  useEffect(() => {
    if (!snapshot?.timer.deadlineAt) return;
    const interval = window.setInterval(() => setClientNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [snapshot]);

  return useMemo(() => {
    if (!snapshot) {
      return {
        timer: undefined,
        operationRemainingSeconds: undefined,
        extraRemainingSeconds: undefined,
      };
    }

    const { timer, receivedAt } = snapshot;
    const estimatedServerNow = timer.serverNow + (clientNow - receivedAt);
    const operationRemainingSeconds = timer.deadlineAt === undefined
      ? undefined
      : Math.max(0, Math.ceil((timer.deadlineAt - estimatedServerNow) / 1000));

    const overtimeSeconds =
      timer.startedAt !== undefined && timer.baseSeconds !== undefined
        ? Math.max(
            0,
            Math.ceil(
              (estimatedServerNow -
                (timer.startedAt + timer.baseSeconds * 1000)) /
                1000,
            ),
          )
        : 0;
    const extraRemainingSeconds = timer.extraRemainingSeconds === undefined
      ? undefined
      : Math.max(0, timer.extraRemainingSeconds - overtimeSeconds);

    return {
      timer,
      operationRemainingSeconds,
      extraRemainingSeconds,
    };
  }, [clientNow, snapshot]);
}
