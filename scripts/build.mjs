// Static production build: bundles content, copies /app to /dist, and stamps
// the service worker with a version so browsers pick up the new build.
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './build-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'app'), dist, { recursive: true });

const hash = createHash('sha1');
for (const f of ['data/content.js', 'js/content.js', 'js/mastery.js', 'js/graph.js', 'js/notes.js', 'js/map.js', 'js/explore.js', 'js/session.js', 'js/store.js', 'js/encounters.js', 'js/app.js', 'styles.css', 'index.html']) {
  hash.update(readFileSync(join(dist, f)));
}
const version = hash.digest('hex').slice(0, 10);
const sw = join(dist, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace("const VERSION = 'dev';", `const VERSION = '${version}';`));
console.log(`built → dist/ (version ${version})`);
