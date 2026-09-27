import { createPublicClient, createWalletClient, custom, defineChain, fallback, http, isAddress, keccak256, stringToHex, type Abi, type Address, type EIP1193Provider } from 'viem';

export type BrowserWallet = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: BrowserWallet } }
type Contract = { name: string; address: Address; abiHash: string; abiPath: string; abi: Abi };
export type Deployment = {
  version: number; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: Contract[];
  network: { chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
    uniswapV4: Record<string, Address> };
  walletAddChain: { chainId: `0x${string}`; chainName: string; rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
};
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw Error(`Unable to load ${path}. Reload to retry.`);
  return response.json();
}
export async function loadDeployment() {
  const deployment = await json('./imd-deployment.json') as Deployment;
  if (deployment.version !== 1 || !Number.isSafeInteger(deployment.chainId) || deployment.chainId !== deployment.network.chainId
    || Number(deployment.walletAddChain.chainId) !== deployment.chainId) throw Error('Deployment network does not match. Transactions are disabled.');
  for (const contract of deployment.contracts) {
    if (!isAddress(contract.address) || !/^[a-f0-9]{64}$/.test(contract.abiHash)
      || !/^abi\/[A-Za-z0-9_]+\.json$/.test(contract.abiPath)) throw Error('Invalid deployment contract.');
    contract.abi = await json(contract.abiPath) as Abi;
    if (!Array.isArray(contract.abi) || keccak256(stringToHex(JSON.stringify(canonical(contract.abi)))).slice(2) !== contract.abiHash) throw Error(`ABI verification failed for ${contract.name}.`);
  }
  const canvas = deployment.contracts.find(c => c.name === 'PixelCanvas');
  const token = deployment.contracts.find(c => c.name === 'LaunchToken');
  if (!canvas || !token || deployment.contracts.length !== 2) throw Error('Deployment contract set is invalid.');
  const chain = defineChain({ id: deployment.chainId, name: deployment.network.name, nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } }, testnet: deployment.network.testnet });
  // Public RPCs are authoritative. A connected wallet on this chain is the final read fallback.
  const walletRead = custom({ async request(args) {
    const provider = window.ethereum;
    if (!provider || Number(await provider.request({ method: 'eth_chainId' })) !== chain.id) throw Error('No wallet read fallback on the required chain.');
    return provider.request(args as Parameters<BrowserWallet['request']>[0]);
  } }, { retryCount: 0 });
  const client = createPublicClient({ chain, transport: fallback([
    ...deployment.network.rpcUrls.map(url => http(url, { timeout: 7000, retryCount: 0 })), walletRead,
  ], { retryCount: 0 }), pollingInterval: 12000 });
  const wallet = () => {
    if (!window.ethereum) throw Error('No browser wallet found. Open this page in a wallet browser or install a browser wallet, then retry.');
    return createWalletClient({ chain, transport: custom(window.ethereum) });
  };
  return { deployment, chain, canvas, token, client, wallet };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
