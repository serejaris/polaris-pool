
import { BallState, GameConfig } from "./definitions";

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const length = (x: number, y: number): number =>
  Math.sqrt(x * x + y * y);

export const normalize = (
  x: number,
  y: number
): { x: number; y: number; len: number } => {
  const len = length(x, y);
  if (!len) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
};

export const distanceSquared = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};

export const areBallsMoving = (balls: BallState[], minV: number): boolean =>
  balls.some((b) => !b.inPocket && (Math.abs(b.vx) > minV || Math.abs(b.vy) > minV));

export const applyPhysicsStep = (
  balls: BallState[],
  cfg: GameConfig,
  pockets: { x: number; y: number; radius: number }[],
  dt: number
): { anyMoving: boolean; pocketedIds: number[] } => {
  const pocketedIds: number[] = [];

  // Integrate velocities with friction
  for (const b of balls) {
    if (b.inPocket) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    const speed = length(b.vx, b.vy);
    if (speed > 0) {
      const frictionForce = cfg.friction * dt;
      if (speed <= frictionForce) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const scale = (speed - frictionForce) / speed;
        b.vx *= scale;
        b.vy *= scale;
      }
    }
  }

  // Cushion collisions
  const left = cfg.table.railThickness + cfg.ballRadius;
  const right =
    cfg.table.width - cfg.table.railThickness - cfg.ballRadius;
  const top = cfg.table.railThickness + cfg.ballRadius;
  const bottom =
    cfg.table.height - cfg.table.railThickness - cfg.ballRadius;

  for (const b of balls) {
    if (b.inPocket) continue;
    if (b.x < left) {
      b.x = left + (left - b.x);
      b.vx = -b.vx * cfg.cushionRestitution;
    } else if (b.x > right) {
      b.x = right - (b.x - right);
      b.vx = -b.vx * cfg.cushionRestitution;
    }
    if (b.y < top) {
      b.y = top + (top - b.y);
      b.vy = -b.vy * cfg.cushionRestitution;
    } else if (b.y > bottom) {
      b.y = bottom - (b.y - bottom);
      b.vy = -b.vy * cfg.cushionRestitution;
    }
  }

  // Ball-ball collisions (naive O(n^2))
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.inPocket) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.inPocket) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (dist2 > 0 && dist2 < minDist * minDist) {
        const dist = Math.sqrt(dist2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const sep = overlap / 2;
        a.x -= nx * sep;
        a.y -= ny * sep;
        b.x += nx * sep;
        b.y += ny * sep;

        const dvx = b.vx - a.vx;
        const dvy = b.vy - a.vy;
        const relVel = dvx * nx + dvy * ny;
        if (relVel < 0) {
          const impulse = -(1 + cfg.ballRestitution) * relVel / 2;
          const ix = impulse * nx;
          const iy = impulse * ny;
          a.vx -= ix;
          a.vy -= iy;
          b.vx += ix;
          b.vy += iy;
        }
      }
    }
  }

  // Pocket detection
  for (const b of balls) {
    if (b.inPocket) continue;
    for (const p of pockets) {
      if (distanceSquared(b.x, b.y, p.x, p.y) <= p.radius * p.radius) {
        b.inPocket = true;
        b.vx = 0;
        b.vy = 0;
        pocketedIds.push(b.id);
        break;
      }
    }
  }

  const anyMoving = areBallsMoving(balls, cfg.minVelocity);
  return { anyMoving, pocketedIds };
};

export const deepCloneBalls = (balls: BallState[]): BallState[] =>
  balls.map((b) => ({ ...b }));
