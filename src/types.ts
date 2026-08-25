export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Entity extends Point, Size {
  color: string;
  glowColor: string;
}

export type PlatformType = 'STANDARD' | 'MOVING' | 'BOUNCY' | 'FRAGILE';

export interface Platform extends Entity {
  type: PlatformType;
  hasGem: boolean;
  gemCollected: boolean;
  vx?: number;
  minX?: number;
  maxX?: number;
  broken?: boolean;
  breakingTimer?: number;
  bounceMultiplier?: number;
  floatOffset?: number;
  floatSpeed?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  glowColor: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface Player extends Entity {
  vx: number;
  vy: number;
  isGrounded: boolean;
  rotation?: number;
}

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

