import type { FinalResult } from "../../game/types";

export function FinalRanking({ result }: { result?: FinalResult }) {
  if (!result) return null;
  return (
    <section className="final-ranking">
      <span className="eyebrow">机会窗口已关闭</span>
      <h2>转型成果</h2>
      <ol>
        {result.rankings.map((entry) => (
          <li key={entry.playerId} className={entry.isWinner ? "is-winner" : ""}>
            <span>#{entry.rank}</span>
            <strong>{entry.nickname}</strong>
            <b>{entry.score} 分</b>
          </li>
        ))}
      </ol>
    </section>
  );
}
