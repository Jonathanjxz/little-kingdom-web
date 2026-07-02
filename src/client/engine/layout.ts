export const GAME_WIDTH = 430;
export const BASE_GAME_HEIGHT = 932;

const MIN_ADAPTIVE_HEIGHT = 900;
const MAX_ADAPTIVE_HEIGHT = 1012;

export interface GameLayout {
  width: number;
  height: number;
}

export function chooseGameLayout(viewportWidth: number, viewportHeight: number): GameLayout {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: GAME_WIDTH, height: BASE_GAME_HEIGHT };
  }

  const aspect = viewportHeight / viewportWidth;
  const minAspect = MIN_ADAPTIVE_HEIGHT / GAME_WIDTH;
  const maxAspect = MAX_ADAPTIVE_HEIGHT / GAME_WIDTH;
  if (aspect < minAspect || aspect > maxAspect) {
    return { width: GAME_WIDTH, height: BASE_GAME_HEIGHT };
  }

  return {
    width: GAME_WIDTH,
    height: Math.round(GAME_WIDTH * aspect),
  };
}
