import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { KingdomScene } from "./KingdomScene";
import { chooseGameLayout } from "./layout";

const MAX_RENDER_SCALE = 2;

export function PhaserGameApp() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;

    hostRef.current.replaceChildren();
    const renderScale = (window.devicePixelRatio || 1) > 1 ? MAX_RENDER_SCALE : 1;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const layout = chooseGameLayout(viewportWidth, viewportHeight);
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#080b0f",
      width: layout.width * renderScale,
      height: layout.height * renderScale,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.NO_CENTER,
        autoRound: true,
        width: layout.width * renderScale,
        height: layout.height * renderScale,
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
