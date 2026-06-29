import type { GamePhase } from "../../game/types";

interface ActionPromptProps {
  isMyTurn: boolean;
  phase: GamePhase;
  currentPlayerName?: string;
  warning: boolean;
}

export function ActionPrompt({
  isMyTurn,
  phase,
  currentPlayerName,
  warning,
}: ActionPromptProps) {
  if (phase === "finished") {
    return (
      <section className="action-prompt is-waiting" data-testid="action-prompt">
        <div data-testid="action-prompt-waiting">
          <span>结算阶段</span>
          <strong>最后岗位已被领取，正在生成转型成果</strong>
        </div>
      </section>
    );
  }

  const actionName = phase === "draw" ? "寻找机会" : "规划转型";
  const detail = phase === "draw"
    ? "请从岗位池或人才市场选择一张机会"
    : "请选择一张机会手牌，投入职业赛道或放弃到人才市场";

  return (
    <section
      className={`action-prompt${isMyTurn ? " is-own-turn" : " is-waiting"}${warning ? " is-warning" : ""}`}
      data-testid="action-prompt"
      aria-live="polite"
    >
      {isMyTurn ? (
        <div data-testid="action-prompt-own-turn">
          <span>该你行动了</span>
          <strong>轮到你：{actionName}</strong>
          <p>{detail}</p>
        </div>
      ) : (
        <div data-testid="action-prompt-waiting">
          <span>行动队列</span>
          <strong>等待 {currentPlayerName ?? "其他候选人"} {actionName}</strong>
        </div>
      )}
    </section>
  );
}
