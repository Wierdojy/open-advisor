const { store } = require('../packages/domain');
store.resetState();
console.log(`Reset data: ${store.dataFile}`);
