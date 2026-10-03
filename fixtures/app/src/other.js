import { sharedLabel } from './shared.js';

export function render(target) {
  target.textContent = `other feature: ${sharedLabel}`;
}
