// Spawns vite build --watch alongside alchemy dev so SPA source edits
// regenerate dist while the local worker keeps serving. Browser still
// needs a manual refresh — no HMR — but at least the bundle is fresh.

const assets = Bun.spawn(['bun', 'run', 'build', '--watch'], {
  cwd: './applications/game',
  stdio: ['inherit', 'inherit', 'inherit'],
});

const worker = Bun.spawn(['bun', '--bun', 'alchemy', 'dev'], {
  stdio: ['inherit', 'inherit', 'inherit'],
});

const stop = () => {
  assets.kill();
  worker.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);

await Promise.race([assets.exited, worker.exited]);
stop();
