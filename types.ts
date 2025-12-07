export interface ImageDataStore {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray; // r, g, b, a
}

export enum HandState {
  UNKNOWN = 'UNKNOWN',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

// MediaPipe Hands types when loaded via script tag
export interface WindowWithMediaPipe extends Window {
  Hands: any;
  Camera: any;
  drawConnectors: any;
  drawLandmarks: any;
  HAND_CONNECTIONS: any;
}