
import {
  BallDefinition,
  BallState,
  BallType,
  GameConfig,
  Pocket,
} from "./definitions";

// American 8-ball ball set
export const BALL_DEFINITIONS: BallDefinition[] = [
  { id: 0, type: BallType.Cue, color: "#ffffff" },
  { id: 8, type: BallType.Eight, color: "#111827" },
  // Solids
  { id: 1, type: BallType.Solid, color: "#f97316" }, // orange
  { id: 2, type: BallType.Solid, color: "#22c55e" }, // green
  { id: 3, type: BallType.Solid, color: "#6366f1" }, // indigo
  { id: 4, type: BallType.Solid, color: "#8b5cf6" }, // violet
  { id: 5, type: BallType.Solid, color: "#ef4444" }, // red
  { id: 6, type: BallType.Solid, color: "#0ea5e9" }, // light blue
  { id: 7, type: BallType.Solid, color: "#111827" }, // black-like but used
  // Stripes
  {
    id: 9,
    type: BallType.Stripe,
    color: "#f97316",
    secondaryColor: "#ffffff",
  },
  {
    id: 10,
    type: BallType.Stripe,
    color: "#22c55e",
    secondaryColor: "#ffffff",
  },
  {
    id: 11,
    type: BallType.Stripe,
    color: "#6366f1",
    secondaryColor: "#ffffff",
  },
  {
    id: 12,
    type: BallType.Stripe,
    color: "#8b5cf6",
    secondaryColor: "#ffffff",
  },
  {
    id: 13,
    type: BallType.Stripe,
    color: "#ef4444",
    secondaryColor: "#ffffff",
  },
  {
    id: 14,
    type: BallType.Stripe,
    color: "#0ea5e9",
    secondaryColor: "#ffffff",
  },
  {
    id: 15,
    type: BallType.Stripe,
    color: "#111827",
    secondaryColor: "#ffffff",
  },
];

export const createDefaultConfig = (): GameConfig => {
  const tableWidth = 1200;
  const tableHeight = 600;
  const railThickness = 36;
  const pocketRadius = 38;
  const ballRadius = 13.5;

  return {
    table: {
      width: tableWidth,
      height: tableHeight,
      railThickness,
      pocketRadius,
    },
    ballRadius,
    friction: 22.0, // px/s^2 style friction
    cushionRestitution: 0.92,
    ballRestitution: 0.98,
    minVelocity: 4,
    maxShotPower: 1.0,
    powerToVelocity: 1350,
    aimLineMaxLength: 220,
  };
};

export const createPockets = (cfg: GameConfig): Pocket[] => {
  const { width, height, pocketRadius } = cfg.table;
  const t = pocketRadius - 6;
  return [
    { x: t, y: t, radius: pocketRadius }, // top-left
    { x: width / 2, y: t - 2, radius: pocketRadius + 6 }, // top-center
    { x: width - t, y: t, radius: pocketRadius }, // top-right
    { x: t, y: height - t, radius: pocketRadius }, // bottom-left
    { x: width / 2, y: height - t + 2, radius: pocketRadius + 6 }, // bottom-center
    { x: width - t, y: height - t, radius: pocketRadius }, // bottom-right
  ];
};

export const createInitialBalls = (cfg: GameConfig): BallState[] => {
  const balls: BallState[] = [];
  const { width, height } = cfg.table;
  const r = cfg.ballRadius;

  // Cue ball position
  const cueX = width * 0.25;
  const cueY = height / 2;

  // Rack apex position
  const rackX = width * 0.68;
  const rackY = height / 2;

  // Prepare triangle rack order: typical 8-ball
  const rackOrder = [
    1,
    10,
    2,
    8,
    11,
    3,
    12,
    13,
    4,
    5,
    9,
    6,
    14,
    7,
    15,
  ];

  // Cue ball
  const cueDef = BALL_DEFINITIONS.find((b) => b.id === 0)!;
  balls.push({
    id: cueDef.id,
    type: cueDef.type,
    x: cueX,
    y: cueY,
    vx: 0,
    vy: 0,
    radius: r,
    inPocket: false,
    color: cueDef.color,
    secondaryColor: cueDef.secondaryColor,
  });

  // Racked balls triangle (5 rows)
  let index = 0;
  const rowCount = 5;
  const rowSpacing = r * 2 + 0.5;
  for (let row = 0; row < rowCount; row++) {
    const ballsInRow = row + 1;
    const rowX = rackX + row * rowSpacing;
    const offsetY = (ballsInRow - 1) * r;
    for (let i = 0; i < ballsInRow; i++) {
      const id = rackOrder[index++];
      const def = BALL_DEFINITIONS.find((b) => b.id === id)!;
      const x = rowX;
      const y = rackY - offsetY / 2 + i * (2 * r);
      balls.push({
        id: def.id,
        type: def.type,
        x,
        y,
        vx: 0,
        vy: 0,
        radius: r,
        inPocket: false,
        color: def.color,
        secondaryColor: def.secondaryColor,
      });
    }
  }

  return balls;
};
