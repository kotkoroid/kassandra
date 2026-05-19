import { mount } from 'svelte';
import App from './App.svelte';
// Side-effect import: hooks console.error / warn + window error
// events to forward diagnostics into the in-game chat. Loaded first
// so it captures errors thrown during the rest of bootstrapping.
import './consoleBridge';
import './styles.css';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Mount target #app not found.');
}

export default mount(App, { target });
