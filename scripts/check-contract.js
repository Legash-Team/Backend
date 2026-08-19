const fs = require('fs');
const path = require('path');

const CONTRACT_PATH_CANDIDATES = [
  path.resolve(__dirname, '../legash_docs/wire-contract.json'),
  path.resolve(__dirname, '../../legash_docs/wire-contract.json'),
  path.resolve(process.cwd(), 'legash_docs/wire-contract.json'),
  path.resolve(process.cwd(), '../legash_docs/wire-contract.json'),
];

const CONTRACT_PATH = CONTRACT_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate));

if (!CONTRACT_PATH) {
  console.error(
    `Contract file not found. Checked:\n  - ${CONTRACT_PATH_CANDIDATES.join('\n  - ')}`
  );
  process.exit(1);
}

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

function normalize(p) {
  return p
    .split('/')
    .map((seg) => (seg.startsWith(':') ? ':p' : seg))
    .join('/');
}

const mounts = [
  { base: '/api/hospitals', router: require('../src/routes/hospitalAuthRoutes') },
  { base: '/api/auth', router: require('../src/routes/sharedAuthRoutes') },
];

const registered = [];
for (const { base, router } of mounts) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods)
      .filter((m) => m !== '_all')
      .map((m) => m.toUpperCase());
    for (const method of methods) {
      registered.push({ method, path: normalize(base + layer.route.path) });
    }
  }
}

const expected = contract.endpoints.map((e) => ({
  method: e.method.toUpperCase(),
  path: normalize(e.path),
}));

const norm = (r) => `${r.method} ${r.path}`;
const registeredSet = new Set(registered.map(norm));

const errors = [];
for (const r of expected) {
  if (!registeredSet.has(norm(r))) errors.push(`MISSING in Backend: ${norm(r)}`);
}

if (errors.length) {
  console.error('CONTRACT DRIFT DETECTED:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`Contract OK: ${expected.length} endpoint(s) match the Backend.`);