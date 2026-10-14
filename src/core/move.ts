import type { Vec3 } from './vec';

/**
 * Direction of keyboard movement in world space (+Y up, +Z toward the default camera).
 * W/S run along Z, A/D along X and ↑/↓ along Y. The axes never depend on the camera.
 * The result is not normalised: no key gives the zero vector.
 */
export const keyboardDirection = (keys: ReadonlySet<string>): Vec3 => {
  const move: Vec3 = [0, 0, 0];
  if (keys.has('w')) move[2] -= 1;
  if (keys.has('s')) move[2] += 1;
  if (keys.has('d')) move[0] += 1;
  if (keys.has('a')) move[0] -= 1;
  if (keys.has('arrowup')) move[1] += 1;
  if (keys.has('arrowdown')) move[1] -= 1;
  return move;
};

/** The legend rows shown in the HUD: which keys drive which world axis. */
export const AXIS_LEGEND: readonly { keys: string; axis: string }[] = [
  { keys: 'W ⟷ S', axis: 'Z axis (away ⟷ toward)' },
  { keys: 'A ⟷ D', axis: 'X axis (left ⟷ right)' },
  { keys: '↑ ⟷ ↓', axis: 'Y axis (up ⟷ down)' },
];
