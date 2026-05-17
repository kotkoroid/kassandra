import * as Build from 'alchemy/Build';

export const Assets = Build.Command('Assets', {
  command: 'bun run build',
  cwd: './applications/game',
  outdir: 'dist',
});
