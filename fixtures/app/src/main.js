import './shell.css';

document.querySelector('#shell-release').textContent = __SHELL_RELEASE__;
window.fixtureReady = true;
window.fixtureResult = { state: 'waiting' };

async function load(loader) {
  const result = document.querySelector('#result');
  try {
    const feature = await loader();
    feature.render(result);
    result.dataset.state = 'loaded';
    window.fixtureResult = { state: 'loaded', value: result.textContent };
  } catch (error) {
    result.textContent = error.message;
    result.dataset.state = 'failed';
    window.fixtureResult = { state: 'failed', error: error.message };
  }
}

document.querySelector('#load-feature').addEventListener('click', () => load(() => import('./lazy.js')));
document.querySelector('#load-other').addEventListener('click', () => load(() => import('./other.js')));
