import type { SocketConnectionState } from "../socket";

interface ConnectionStatusProps {
  state: SocketConnectionState;
  compact?: boolean;
}

export function ConnectionStatus({ state, compact }: ConnectionStatusProps) {
  const label = state.status === "connected"
    ? "已接入人才网络"
    : state.status === "connecting"
      ? "正在接入人才网络"
      : state.status === "reconnecting"
        ? `网络恢复中 · 第 ${state.attempt} 次`
        : state.status === "reconnect_failed"
          ? "人才网络连接失败"
          : "人才网络已断开";

  return (
    <div
      className={`connection-status connection-status--${state.status}${compact ? " connection-status--compact" : ""}`}
      data-testid="socket-status"
    >
      <span className="connection-status__signal" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
