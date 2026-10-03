import { sharedLabel } from './shared.js';
import badge from './badge.svg';
import './feature.css';

export function render(target) {
  target.className = 'feature';
  target.textContent = `lazy feature: ${sharedLabel}`;
  const image = document.createElement('img');
  image.id = 'feature-badge';
  image.alt = 'Fixture release badge';
  image.src = badge;
  target.append(image);
}
