import type { TimeControlMode } from "../../server/timer/time-control";

const MODE_LABELS: Record<TimeControlMode, string> = {
  none: "无限时",
  standard: "标准窗口",
  relaxed: "宽松窗口",
};

interface TimerPanelProps {
  mode: TimeControlMode;
  phase?: string;
  operationRemainingSeconds?: number;
  extraRemainingSeconds?: number;
  warning?: boolean;
}

export function TimerPanel({
  mode,
  phase,
  operationRemainingSeconds,
  extraRemainingSeconds,
  warning,
}: TimerPanelProps) {
  return (
    <section
      className={`timer-panel${warning ? " is-warning" : ""}`}
      data-testid="timer-panel"
      data-phase={phase}
    >
      <div className="eyebrow">机会窗口</div>
      <div className="timer-panel__mode">{MODE_LABELS[mode]}</div>
      {mode === "none" ? (
        <strong className="timer-panel__unlimited">不限时</strong>
      ) : (
        <div className="timer-panel__numbers">
          <div>
            <span>本次操作</span>
            <strong>{operationRemainingSeconds ?? 0}s</strong>
          </div>
          <div>
            <span>额外时间</span>
            <strong>{extraRemainingSeconds ?? 0}s</strong>
          </div>
        </div>
      )}
    </section>
  );
}
