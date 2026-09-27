import { formatUnits, type Address, type Hex } from 'viem';
import type { Runtime } from './config';

export type Pixel = { index: number; colour: string };
export type Snapshot = { block: bigint; colours: string[]; prices: Record<number, bigint>; painter: Address;
  balance?: bigint; allowance?: bigint; withdrawable?: bigint };
export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const amount = (value: bigint | undefined, decimals: number) => value === undefined ? '—' : formatUnits(value, decimals);
export function errorMessage(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: unknown };
  if (e.code === 4001 || /rejected|denied/i.test(e.shortMessage || e.message || '')) return 'Request declined in your wallet. Your draft is still here; retry when ready.';
  return (e.shortMessage || e.message || 'The request failed. Refresh the live state and retry.').slice(0, 420);
}
export function decodeCanvas(data: Hex): string[] {
  if (data.length !== 6146) throw Error('Canvas response has an invalid length.');
  return Array.from({ length: 1024 }, (_, index) => `#${data.slice(2 + index * 6, 8 + index * 6)}`);
}
export function queueCost(queue: Pixel[], prices: Record<number, bigint>, maxPrice: bigint) {
  const running = { ...prices };
  let total = 0n;
  for (const pixel of queue) {
    if (running[pixel.index] === undefined) return undefined;
    const price = running[pixel.index];
    total += price;
    running[pixel.index] = price * 11n / 10n > maxPrice ? maxPrice : price * 11n / 10n;
  }
  return total;
}
export async function verifyRuntime(runtime: Runtime) {
  const { client, canvas, token, deployment } = runtime;
  if (await client.getChainId() !== deployment.chainId) throw Error('RPC returned the wrong network. Transactions are disabled.');
  const codes = await Promise.all(deployment.contracts.map(c => client.getCode({ address: c.address })));
  if (codes.some(code => !code || code === '0x')) throw Error('Deployed contract code is missing. Transactions are disabled.');
  const [actualToken, decimals, maxPrice] = await Promise.all([
    client.readContract({ ...canvas, functionName: 'token' }),
    client.readContract({ ...token, functionName: 'decimals' }),
    client.readContract({ ...canvas, functionName: 'MAX_PRICE' }),
  ]);
  if (String(actualToken).toLowerCase() !== token.address.toLowerCase()) throw Error('PixelCanvas.token() does not match the attested PIXL token.');
  return { decimals: Number(decimals), maxPrice: maxPrice as bigint, tokenAddress: actualToken as Address };
}
export async function readSnapshot(runtime: Runtime, tokenAddress: Address, selected: number, queue: Pixel[], account?: Address): Promise<Snapshot> {
  const { client, canvas, token } = runtime;
  const block = await client.getBlockNumber({ cacheTime: 0 });
  const readCanvas = (functionName: string, args: unknown[] = []) => client.readContract({ ...canvas, functionName, args, blockNumber: block });
  const readToken = (functionName: string, args: unknown[]) => client.readContract({ abi: token.abi, address: tokenAddress, functionName, args, blockNumber: block });
  const indices = [...new Set([selected, ...queue.map(p => p.index)])];
  const [colours, painter, priceValues, balances] = await Promise.all([
    readCanvas('canvas'), readCanvas('painterOf', [BigInt(selected)]),
    Promise.all(indices.map(index => readCanvas('priceOf', [BigInt(index)]))),
    account ? Promise.all([readToken('balanceOf', [account]), readToken('allowance', [account, canvas.address]), readCanvas('withdrawable', [account])]) : undefined,
  ]);
  return { block, colours: decodeCanvas(colours as Hex), painter: painter as Address,
    prices: Object.fromEntries(indices.map((index, i) => [index, priceValues[i] as bigint])),
    balance: balances?.[0] as bigint | undefined, allowance: balances?.[1] as bigint | undefined, withdrawable: balances?.[2] as bigint | undefined };
}
export async function switchNetwork(runtime: Runtime) {
  const wallet = runtime.wallet();
  try { await wallet.switchChain({ id: runtime.chain.id }); }
  catch (error) {
    const e = error as { code?: number; message?: string; cause?: { code?: number } };
    if (e.code !== 4902 && e.cause?.code !== 4902 && !/unknown chain|unrecognized chain|not added/i.test(e.message || '')) throw error;
    await window.ethereum!.request({ method: 'wallet_addEthereumChain', params: [runtime.deployment.walletAddChain] });
    await wallet.switchChain({ id: runtime.chain.id });
  }
}
export async function assertWallet(runtime: Runtime, account: Address) {
  const wallet = runtime.wallet();
  const [chain, accounts] = await Promise.all([wallet.getChainId(), wallet.getAddresses()]);
  if (chain !== runtime.chain.id || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw Error('Wallet account or network changed. Reconnect and review the draft before signing.');
  return wallet;
}
