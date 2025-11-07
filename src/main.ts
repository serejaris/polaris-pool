
import { createGame } from "./game";

function main(): void {
  const root = document.createElement("div");
  root.id = "game-root";
  document.body.appendChild(root);

  const gameWrapper = document.createElement("div");
  gameWrapper.className = "game-wrapper";

  const canvas = document.createElement("canvas");
  canvas.id = "game-canvas";
  gameWrapper.appendChild(canvas);
  root.appendChild(gameWrapper);

  const game = createGame(canvas);
  game.start();
}

main();
