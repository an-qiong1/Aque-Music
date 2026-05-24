const { spawnSync } = require('child_process');
const path = require('path');

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+$/, '')
  .replace('T', '-');

const output = path.join('build-output', `verify-${stamp}`);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron-builder', 'build', '--win', 'dir', `--config.directories.output=${output}`],
  { stdio: 'inherit' }
);

process.exit(result.status || 0);
