
export type PlayerId = 1 | 2;

export enum BallType {
  Cue = "cue",
  Eight = "eight",
  Solid = "solid",
  Stripe = "stripe",
}

export interface BallDefinition {
  id: number;
  type: BallType;
  color: string;
  secondaryColor?: string;
}

export interface BallState {
  id: number;
  type: BallType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  inPocket: boolean;
  color: string;
  secondaryColor?: string;
}

export interface Pocket {
  x: number;
  y: number;
  radius: number;
}

export interface TableConfig {
  width: number;
  height: number;
  railThickness: number;
  pocketRadius: number;
}

export interface GameConfig {
  table: TableConfig;
  ballRadius: number;
  friction: number;
  cushionRestitution: number;
  ballRestitution: number;
  minVelocity: number;
  maxShotPower: number;
  powerToVelocity: number;
  aimLineMaxLength: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  assignedType: BallType.Solid | BallType.Stripe | null;
  pocketed: number[];
  score: number;
}

export enum TurnResultType {
  Normal = "normal",
  Foul = "foul",
  GameWon = "game-won",
}

export interface TurnSummary {
  type: TurnResultType;
  message: string;
  winnerId?: PlayerId;
  foulReason?: string;
  turnKeeps?: boolean;
  ballsPocketed: number[];
}

export interface AimState {
  isAiming: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  power: number;
}

export interface InputState {
  mouseX: number;
  mouseY: number;
  isMouseDown: boolean;
}
