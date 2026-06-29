import { useState } from "react";
import type { PlayerId } from "../../game/types";
import type { PublicRoomView } from "../../server/socket/protocol";

const MODE_LABEL = {
  none: "无限时",
  standard: "标准 · 20 秒基础 + 50 秒额外",
  relaxed: "宽松 · 30 秒基础 + 80 秒额外",
} as const;

interface RoomLobbyProps {
  room: PublicRoomView;
  playerId?: PlayerId;
  pending?: string;
  onStart: () => void;
  onLeave: () => void;
}

export function RoomLobby({
  room,
  playerId,
  pending,
  onStart,
  onLeave,
}: RoomLobbyProps) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostPlayerId === playerId;

  const copyInvitation = async () => {
    const invitation =
      `我在玩《最后岗位》，房间号：${room.roomId}\n` +
      `打开链接加入：${window.location.origin}/`;
    await navigator.clipboard.writeText(invitation);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="formal-shell lobby-page">
      <header className="lobby-header">
        <div>
          <span className="brand-kicker">THE LAST OPENING</span>
          <h1>候选人集结中</h1>
          <p>当所有人准备就绪，房主将开启最后一批岗位。</p>
        </div>
        <button type="button" className="text-action" onClick={onLeave}>
          离开房间
        </button>
      </header>

      <section className="room-ticket">
        <div>
          <span className="eyebrow">房间编号</span>
          <strong data-testid="room-id-display">Room: {room.roomId}</strong>
        </div>
        <button type="button" onClick={copyInvitation}>
          {copied ? "邀请信息已复制" : "复制邀请信息"}
        </button>
      </section>

      <div className="lobby-grid">
        <section className="candidate-roster">
          <div className="section-heading">
            <div>
              <span className="eyebrow">转型小组</span>
              <h2>候选人名单</h2>
            </div>
            <strong>{room.members.length} / 4</strong>
          </div>
          <ul data-testid="member-list">
            {room.members.map((member, index) => (
              <li key={member.playerId}>
                <span className="candidate-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{member.nickname}</strong>
                  <small>{member.isHost ? "发起人 / 房主" : "候选人"}</small>
                </div>
                <span className={member.isConnected ? "online" : "offline"}>
                  {member.isConnected ? "在线" : "离线"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="lobby-brief">
          <span className="eyebrow">本局规则</span>
          <h2 data-testid="room-time-control">{MODE_LABEL[room.timeControl.mode]}</h2>
          <dl>
            <div><dt>参与人数</dt><dd>2–4 人</dd></div>
            <div><dt>职业赛道</dt><dd>5 条</dd></div>
            <div><dt>行动顺序</dt><dd>规划 → 寻找机会</dd></div>
          </dl>
          {isHost ? (
            <button
              type="button"
              className="primary-action"
              onClick={onStart}
              disabled={room.members.length < 2 || pending === "start"}
              data-testid="start-game-button"
            >
              {room.members.length < 2 ? "等待更多候选人" : "开启最后岗位"}
            </button>
          ) : (
            <p className="waiting-message">等待房主开启岗位窗口。</p>
          )}
        </aside>
      </div>
    </main>
  );
}
