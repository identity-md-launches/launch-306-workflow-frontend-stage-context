import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, formatUnits } from 'viem';
const deployment = JSON.parse(await readFile(new URL('../../dist/imd-deployment.json', import.meta.url)));
const report = { checkedAt: new Date().toISOString(), sourceCommit: deployment.sourceCommit, endpoints: [] };
for (const url of deployment.network.rpcUrls) {
  const client = createPublicClient({ transport: http(url, { timeout: 12000, retryCount: 0 }) });
  try {
    const chainId = await client.getChainId();
    if (chainId !== deployment.chainId) throw Error('RPC chain mismatch');
    const contracts = await Promise.all(deployment.contracts.map(async contract => {
      const code = await client.getCode({ address: contract.address });
      if (!code || code === '0x') throw Error('Missing code for ' + contract.name);
      return { name: contract.name, address: contract.address, codeBytes: (code.length - 2) / 2 };
    }));
    const canvas = deployment.contracts.find(c => c.name === 'PixelCanvas');
    const token = deployment.contracts.find(c => c.name === 'LaunchToken');
    const abi = JSON.parse(await readFile(new URL('../../dist/' + canvas.abiPath, import.meta.url)));
    const actualToken = await client.readContract({ address: canvas.address, abi, functionName: 'token' });
    const colours = await client.readContract({ address: canvas.address, abi, functionName: 'canvas' });
    const price = await client.readContract({ address: canvas.address, abi, functionName: 'priceOf', args: [0n] });
    if (actualToken.toLowerCase() !== token.address.toLowerCase()) throw Error('Token binding mismatch');
    report.endpoints.push({ url, chainId, contracts, token: actualToken, canvasBytes: (colours.length - 2) / 2, pixel0PricePIXL: formatUnits(price, 18), ok: true });
  } catch (error) { report.endpoints.push({ url, ok: false, error: error.shortMessage || error.message }); }
}
await writeFile(new URL('../../docs/frontend/live-rpc.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
