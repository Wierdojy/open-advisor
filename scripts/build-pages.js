const fs = require('node:fs');
const path = require('node:path');
const { store, derive } = require('../packages/domain');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'apps', 'web', 'public');
const pagesDir = path.join(root, 'dist-pages');
const buildVersion = Date.now().toString();

fs.mkdirSync(pagesDir, { recursive: true });
for (const file of ['app.js', 'styles.css']) {
  fs.copyFileSync(path.join(publicDir, file), path.join(pagesDir, file));
}

const rawIndex = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const pagesIndex = rawIndex
  .replace('./styles.css', `./styles.css?v=${buildVersion}`)
  .replace('<script src="./app.js"></script>', `<script>window.OPEN_ADVISOR_BUILD = "${buildVersion}";</script>\n    <script src="./app.js?v=${buildVersion}"></script>`);
fs.writeFileSync(path.join(pagesDir, 'index.html'), pagesIndex);

const bootstrap = derive.buildBootstrap(store.loadState());
fs.writeFileSync(path.join(pagesDir, 'demo-bootstrap.json'), JSON.stringify(bootstrap, null, 2));
fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');

console.log(`Built static Pages site in ${pagesDir}`);
