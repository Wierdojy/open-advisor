const fs = require('node:fs');
const path = require('node:path');
const defaultState = require('./default-state');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const dataFile = path.join(dataDir, 'app-state.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureStateFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultState, null, 2));
  }
}

function loadState() {
  ensureStateFile();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function saveState(state) {
  ensureStateFile();
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
  return state;
}

function resetState() {
  saveState(clone(defaultState));
  return loadState();
}

function update(mutator) {
  const state = loadState();
  const next = mutator(clone(state)) || state;
  saveState(next);
  return next;
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  dataFile,
  loadState,
  saveState,
  resetState,
  update,
  makeId,
  clone
};
