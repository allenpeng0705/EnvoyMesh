import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
console.log('__dirname:', __dirname);
const WS_ROOT = resolve(__dirname, '..', '..');
console.log('WS_ROOT:', WS_ROOT);
console.log('package.json path:', join(WS_ROOT, 'package.json'));
console.log('exists:', require('node:fs').existsSync(join(WS_ROOT, 'package.json')));
