import { useState } from "react";

interface JoinRoomPanelProps {
  disabled: boolean;
  onJoin: (nickname: string, roomId: string) => void;
}

export function JoinRoomPanel({ disabled, onJoin }: JoinRoomPanelProps) {
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");

  return (
    <section className="entry-panel">
      <span className="entry-panel__number">02</span>
      <div>
        <span className="eyebrow">接受同行邀请</span>
        <h2>加入房间</h2>
      </div>
      <label>
        候选人昵称
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="输入你的称呼"
          data-testid="join-nickname-input"
        />
      </label>
      <label>
        房间编号
        <input
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          placeholder="例如 room-12"
          data-testid="room-id-input"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !nickname.trim() || !roomId.trim()}
        onClick={() => onJoin(nickname.trim(), roomId)}
        data-testid="join-room-button"
      >
        进入人才交易所
      </button>
    </section>
  );
}
