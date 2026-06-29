interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      className={`sound-toggle${enabled ? " is-enabled" : ""}`}
      onClick={onToggle}
      data-testid="sound-toggle"
      aria-pressed={enabled}
    >
      音效：{enabled ? "开" : "关"}
    </button>
  );
}
