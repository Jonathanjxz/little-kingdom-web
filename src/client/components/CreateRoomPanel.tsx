import { useState } from "react";
import type { TimeControlMode } from "../../server/timer/time-control";

interface CreateRoomPanelProps {
  disabled: boolean;
  onCreate: (nickname: string, mode: TimeControlMode) => void;
}

export function CreateRoomPanel({ disabled, onCreate }: CreateRoomPanelProps) {
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<TimeControlMode>("standard");

  return (
    <section className="entry-panel entry-panel--primary">
      <span className="entry-panel__number">01</span>
      <div>
        <span className="eyebrow">建立转型小组</span>
        <h2>创建房间</h2>
      </div>
      <label>
        候选人昵称
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="输入你的称呼"
          data-testid="nickname-input"
        />
      </label>
      <label>
        机会窗口
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as TimeControlMode)}
          data-testid="time-control-select"
        >
          <option value="none">无限时</option>
          <option value="standard">标准 · 20s + 50s</option>
          <option value="relaxed">宽松 · 30s + 80s</option>
        </select>
      </label>
      <button
        type="button"
        className="primary-action"
        disabled={disabled || !nickname.trim()}
        onClick={() => onCreate(nickname.trim(), mode)}
        data-testid="create-room-button"
      >
        开放岗位窗口
      </button>
    </section>
  );
}
