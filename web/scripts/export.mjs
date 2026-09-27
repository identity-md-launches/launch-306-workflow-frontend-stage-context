import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { keccak256, stringToHex } from 'viem';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const readJSON = async p => JSON.parse(await readFile(p, 'utf8'));
const handoff = await readJSON(resolve(root, 'web/deployment/handoff.json'));
const network = await readJSON(resolve(root, 'web/deployment/network.json'));
export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hashABI = abi => keccak256(stringToHex(JSON.stringify(canonical(abi)))).slice(2);
if (handoff.chainId !== network.network.chainId || Number(network.walletAddChain.chainId) !== handoff.chainId) throw Error('Network mismatch');
if (new Set(handoff.contracts.map(c => c.name)).size !== handoff.contracts.length) throw Error('Duplicate contract');
const contracts = [];
const check = process.argv.includes('--check');
for (const { name, address, abiHash } of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error('Unsafe ABI name');
  const bytes = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], { cwd: root });
  const abi = JSON.parse(bytes);
  if (!Array.isArray(abi) || hashABI(abi) !== abiHash) throw Error(`ABI hash mismatch: ${name}`);
  const abiPath = `abi/${name}.json`;
  if (check) {
    if (!(await readFile(resolve(dist, abiPath))).equals(bytes)) throw Error(`ABI bytes differ: ${name}`);
  } else {
    await mkdir(resolve(dist, 'abi'), { recursive: true });
    await writeFile(resolve(dist, abiPath), bytes);
  }
  contracts.push({ name, address, abiHash, abiPath });
  console.log(`Verified ${name}: ${abiHash}`);
}
async function inventory(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('Symlink in export');
    if (entry.isDirectory()) files.push(...await inventory(resolve(dir, entry.name), `${path}/`));
    else if (path !== 'imd-deployment.json') {
      if ((await stat(resolve(dist, path))).size > 8388608) throw Error('Asset too large');
      files.push({ path, sha256: createHash('sha256').update(await readFile(resolve(dist, path))).digest('hex') });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const assets = await inventory(dist);
if (assets.length > 128 || !assets.some(a => a.path === 'index.html')) throw Error('Invalid asset inventory');
const manifest = { version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash, contracts, assets,
  network: network.network, walletAddChain: network.walletAddChain };
const destination = resolve(dist, 'imd-deployment.json');
if (check) {
  if (JSON.stringify(await readJSON(destination)) !== JSON.stringify(manifest)) throw Error('Export manifest mismatch');
} else await writeFile(destination, JSON.stringify(manifest, null, 2) + '\n');
const total = (await Promise.all([...assets.map(a => a.path), 'imd-deployment.json'].map(async p => (await stat(resolve(dist, p))).size))).reduce((a, b) => a + b, 0);
if (total >= 8 * 1024 * 1024) throw Error('Export alone exhausts submission budget');
console.log(`${check ? 'Checked' : 'Emitted'} manifest: ${assets.length} assets, ${total} bytes`);
