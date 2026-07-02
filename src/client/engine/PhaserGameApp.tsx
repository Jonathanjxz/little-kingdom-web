import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { KingdomScene } from "./KingdomScene";

const GAME_WIDTH = 430;
const GAME_HEIGHT = 932;
const MAX_RENDER_SCALE = 2;

export function PhaserGameApp() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;

    hostRef.current.replaceChildren();
    const renderScale = (window.devicePixelRatio || 1) > 1 ? MAX_RENDER_SCALE : 1;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#080b0f",
      width: GAME_WIDTH * renderScale,
      height: GAME_HEIGHT * renderScale,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.NO_CENTER,
        autoRound: true,
        width: GAME_WIDTH * renderScale,
        height: GAME_HEIGHT * renderScale,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
      scene: [KingdomScene],
    });

    return () => {
      const host = hostRef.current;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      host?.replaceChildren();
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
