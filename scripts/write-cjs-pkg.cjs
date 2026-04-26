// Write a tiny package.json into dist/cjs and dist/esm so Node's
// resolver picks the correct module type for each.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'packages', 'shared', 'dist');
fs.mkdirSync(path.join(root, 'cjs'), { recursive: true });
fs.mkdirSync(path.join(root, 'esm'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'cjs', 'package.json'),
  JSON.stringify({ type: 'commonjs' }) + '\n',
);
fs.writeFileSync(
  path.join(root, 'esm', 'package.json'),
  JSON.stringify({ type: 'module' }) + '\n',
);
