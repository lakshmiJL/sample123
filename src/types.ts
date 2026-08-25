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

export interface Platform extends Entity {
  hasGem: boolean;
  gemCollected: boolean;
}

export interface Player extends Entity {
  vx: number;
  vy: number;
  isGrounded: boolean;
}

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';
