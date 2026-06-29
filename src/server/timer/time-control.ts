export type TimeControlMode = "none" | "standard" | "relaxed";

export interface TimeControlConfig {
  mode: TimeControlMode;
  baseSeconds?: number;
  extraSeconds?: number;
}

export const DEFAULT_TIME_CONTROL_MODE: TimeControlMode = "standard";

export function createTimeControlConfig(
  mode: TimeControlMode = DEFAULT_TIME_CONTROL_MODE,
): TimeControlConfig {
  switch (mode) {
    case "none":
      return { mode };
    case "standard":
      return { mode, baseSeconds: 20, extraSeconds: 50 };
    case "relaxed":
      return { mode, baseSeconds: 30, extraSeconds: 80 };
  }
}
