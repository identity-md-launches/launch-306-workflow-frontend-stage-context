import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, encodeAbiParameters, encodeEventTopics, zeroAddress, toHex } from 'viem';
export const manifest = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url)));
const token = manifest.contracts.find(c => c.name === 'LaunchToken');
const canvas = manifest.contracts.find(c => c.name === 'PixelCanvas');
const tokenABI = JSON.parse(readFileSync(new URL('../../dist/' + token.abiPath, import.meta.url)));
const canvasABI = JSON.parse(readFileSync(new URL('../../dist/' + canvas.abiPath, import.meta.url)));
export const account = '0x1234567890123456789012345678901234567890';
const txHash = '0x' + 'ab'.repeat(32);
const blockHash = '0x' + 'cd'.repeat(32);
const unit = 10n ** 18n;
export async function mockChain(page, options = {}) {
  const state = { chain: manifest.chainId, balance: 10000n * unit, allowance: 0n, credit: 25n * unit,
    prices: {}, colours: Array(1024).fill('000000'), calls: [], sent: [], reject: false, failSimulation: false,
    missingCode: false, badRPC: false, unknownChain: false, connected: false, eventLogs: [], ...options };
  const price = index => state.prices[index] ?? 10n * unit;
  const painted = (index, colour) => {
    const cost = price(index); state.balance -= cost; state.allowance -= cost;
    state.prices[index] = cost * 11n / 10n > 1000000n * unit ? 1000000n * unit : cost * 11n / 10n;
    state.colours[index] = Number(colour).toString(16).padStart(6, '0');
  };
  const decode = tx => decodeFunctionData({ abi: tx.to.toLowerCase() === token.address.toLowerCase() ? tokenABI : canvasABI, data: tx.data || tx.input });
  async function rpc({ method, params = [] }, wallet = false) {
    state.calls.push({ method, params, wallet });
    if (wallet && method === 'eth_requestAccounts') { if (state.reject) throw { code: 4001, message: 'User rejected' }; state.connected = true; return [account]; }
    if (method === 'eth_accounts') return state.connected ? [account] : [];
    if (method === 'eth_chainId') return toHex(wallet ? state.chain : manifest.chainId);
    if (method === 'wallet_switchEthereumChain') {
      if (state.unknownChain) throw { code: 4902, message: 'Unknown chain' };
      state.chain = Number(params[0].chainId); return null;
    }
    if (method === 'wallet_addEthereumChain') { state.unknownChain = false; return null; }
    if (state.badRPC && !wallet) throw { code: -32000, message: 'RPC unavailable' };
    if (method === 'eth_getCode') return state.missingCode ? '0x' : '0x6001600055';
    if (method === 'eth_blockNumber') { state.block = (state.block ?? 4095) + 1; return toHex(state.block); }
    if (method === 'eth_newFilter') return '0x1';
    if (method === 'eth_uninstallFilter') return true;
    if (method === 'eth_getFilterChanges' || method === 'eth_getLogs') return state.eventLogs.splice(0);
    if (method === 'eth_call') {
      const tx = params[0];
      const abi = tx.to.toLowerCase() === token.address.toLowerCase() ? tokenABI : canvasABI;
      const { functionName, args = [] } = decode(tx);
      let result;
      switch (functionName) {
        case 'token': result = options.wrongToken ? zeroAddress : token.address; break;
        case 'decimals': result = 18; break;
        case 'MAX_PRICE': result = 1000000n * unit; break;
        case 'canvas': result = '0x' + state.colours.join(''); break;
        case 'priceOf': result = price(Number(args[0])); break;
        case 'painterOf': result = zeroAddress; break;
        case 'balanceOf': result = state.balance; break;
        case 'allowance': result = state.allowance; break;
        case 'withdrawable': result = state.credit; break;
        case 'approve': if (state.failSimulation) throw { code: 3, message: 'execution reverted: approval failed' }; result = true; break;
        case 'paint': case 'paintBatch': case 'withdraw':
          if (state.failSimulation) throw { code: 3, message: 'execution reverted: simulated failure' };
          return '0x';
        default: throw Error('Unexpected call ' + functionName);
      }
      return encodeFunctionResult({ abi, functionName, result });
    }
    if (method === 'eth_sendTransaction') {
      if (state.reject) throw { code: 4001, message: 'User rejected' };
      const { functionName, args = [] } = decode(params[0]);
      state.rawTx = params[0];
      state.sent.push({ functionName, args, to: params[0].to });
      if (state.reverted) return txHash;
      if (functionName === 'approve') state.allowance = args[1];
      if (functionName === 'paint') painted(Number(args[0]), args[1]);
      if (functionName === 'paintBatch') args[0].forEach((index, i) => painted(Number(index), args[1][i]));
      if (functionName === 'withdraw') { state.balance += state.credit; state.credit = 0n; }
      return txHash;
    }
    if (method === 'eth_getTransactionReceipt') return state.delayReceipt ? null : { transactionHash: txHash, blockHash, blockNumber: '0x1000', transactionIndex: '0x0', from: account, to: canvas.address, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', contractAddress: null, logs: [], logsBloom: '0x' + '00'.repeat(256), status: state.reverted ? '0x0' : '0x1', type: '0x2' };
    if (method === 'eth_getTransactionByHash') return { ...state.rawTx, hash: txHash, from: account, input: state.rawTx.data, nonce: '0x0', gas: '0x186a0', gasPrice: '0x1', value: '0x0', type: '0x0', blockHash: null, blockNumber: null, transactionIndex: null, r: '0x1', s: '0x1', v: '0x1b' };
    if (method === 'eth_getBlockByNumber') return { number: toHex(state.block ?? 4096), hash: blockHash, parentHash: blockHash, timestamp: '0x1', gasLimit: '0x1000000', gasUsed: '0x0', transactions: [], difficulty: '0x0', extraData: '0x', size: '0x1' };
    if (method === 'eth_estimateGas') return '0x186a0';
    if (method === 'wallet_getCapabilities') return {};
    throw Error('Unexpected RPC ' + method);
  }
  await page.route(url => manifest.network.rpcUrls.some(endpoint => url.href.startsWith(endpoint)), async route => {
    const data = route.request().postDataJSON();
    const respond = async request => { try { return { jsonrpc: '2.0', id: request.id, result: await rpc(request) }; }
      catch (error) { return { jsonrpc: '2.0', id: request.id, error: { code: error.code || -32000, message: error.message } }; } };
    await route.fulfill({ json: Array.isArray(data) ? await Promise.all(data.map(respond)) : await respond(data) });
  });
  if (!options.noWallet) {
    await page.exposeFunction('__walletRPC', async args => { try { return { result: await rpc(args, true) }; } catch (error) { return { error: { code: error.code, message: error.message } }; } });
    await page.addInitScript(() => {
      const listeners = {};
      window.ethereum = { request: async args => { const response = await window.__walletRPC(args); if (response.error) throw response.error; return response.result; },
        on: (event, fn) => { (listeners[event] ||= []).push(fn); },
        removeListener: (event, fn) => { listeners[event] = listeners[event]?.filter(f => f !== fn); } };
      window.__emitWallet = event => listeners[event]?.forEach(fn => fn());
    });
  }
  state.paintEvent = (index, colour) => {
    painted(index, colour);
    state.eventLogs.push({ address: canvas.address, blockHash, blockNumber: '0x1000', data: encodeAbiParameters([{ type: 'uint24' }, { type: 'uint256' }], [colour, 10n * unit]),
      topics: encodeEventTopics({ abi: canvasABI, eventName: 'Painted', args: { index: BigInt(index), painter: account } }),
      logIndex: '0x0', transactionHash: txHash, transactionIndex: '0x0', removed: false });
  };
  return state;
}
