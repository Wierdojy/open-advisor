const fs = require('node:fs');
const path = require('node:path');
const { store, derive } = require('../packages/domain');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'apps', 'web', 'public');
const pagesDir = path.join(root, 'dist-pages');

fs.mkdirSync(pagesDir, { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css']) {
  fs.copyFileSync(path.join(publicDir, file), path.join(pagesDir, file));
}

const bootstrap = derive.buildBootstrap(store.loadState());
fs.writeFileSync(path.join(pagesDir, 'demo-bootstrap.json'), JSON.stringify(bootstrap, null, 2));
fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');

console.log(`Built static Pages site in ${pagesDir}`);
