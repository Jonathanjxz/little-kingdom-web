import type { GameEvent } from "../../game/types";

const EVENT_LABELS: Record<GameEvent["type"], string> = {
  CARD_PLACED: "投入职业赛道",
  CARD_DISCARDED: "机会进入人才市场",
  CARD_DRAWN_FROM_DECK: "从岗位池寻找机会",
  CARD_DRAWN_FROM_DISCARD: "从人才市场获得机会",
  PLAY_PHASE_SKIPPED: "本轮未能规划转型",
  TURN_COMPLETED: "完成本轮行动",
  TURN_TIMED_OUT: "机会窗口超时",
  AUTO_ACTION_APPLIED: "系统执行自动选择",
  GAME_FINISHED: "最后岗位已被领取",
};

export function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <aside className="event-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">实时记录</span>
          <h2>时代动态</h2>
        </div>
      </div>
      <div className="event-list" data-testid="event-log">
        {events.length === 0 && <p>等待第一项转型决策。</p>}
        {events.slice(-12).reverse().map((event) => (
          <div className="event-list__item" key={event.id}>
            <span>{EVENT_LABELS[event.type]}</span>
            <small>{event.playerId ?? "系统"}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}
