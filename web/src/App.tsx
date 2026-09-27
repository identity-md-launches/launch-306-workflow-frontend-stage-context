import { useCallback, useEffect, useRef, useState } from 'react';
import { zeroAddress, type Address, type Hex } from 'viem';
import { loadDeployment, type Runtime } from './config';
import { amount, assertWallet, errorMessage, queueCost, readSnapshot, short, switchNetwork, verifyRuntime, type Pixel, type Snapshot } from './model';
import { Canvas } from './Canvas';

const swatches = ['#2a4bd7', '#ee5947', '#f4b942', '#2b805d', '#8556b8', '#ea81b0', '#ffffff', '#000000'];
type Verified = Awaited<ReturnType<typeof verifyRuntime>>;
export function App() {
  const [runtime, setRuntime] = useState<Runtime>();
  const [verified, setVerified] = useState<Verified>();
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [selected, setSelected] = useState(0);
  const [colour, setColour] = useState(swatches[0]);
  const [queue, setQueue] = useState<Pixel[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [fresh, setFresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readError, setReadError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading the attested deployment…');
  const [busy, setBusy] = useState('');
  const [hash, setHash] = useState<Hex>();
  const [approval, setApproval] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [eventError, setEventError] = useState('');
  const generation = useRef(0);
  const busyRef = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const decimals = verified?.decimals ?? 18;
  const total = snapshot && verified ? queueCost(queue, snapshot.prices, verified.maxPrice) : undefined;
  const draftKey = JSON.stringify(queue) + ':' + total?.toString() + ':' + account;
  const correctChain = walletChain === runtime?.chain.id;
  const ready = !!(account && correctChain && verified && fresh && snapshot && !busy);
  const approved = approval === draftKey && total !== undefined && (snapshot?.allowance ?? 0n) >= total;
  const funded = total !== undefined && (snapshot?.balance ?? 0n) >= total;
  const explorer = runtime?.deployment.network.explorer;

  const initialize = useCallback(async () => {
    setReadError(''); setVerified(undefined); setFresh(false);
    try {
      const next = await loadDeployment(); setRuntime(next);
      const result = await verifyRuntime(next); setVerified(result);
      setStatus('Deployment verified. Select a pixel to start a draft.');
    } catch (e) { setReadError(errorMessage(e)); setStatus('Live connection unavailable. Retry to verify the deployment.'); }
  }, []);
  useEffect(() => { void initialize(); }, [initialize]);

  const refresh = useCallback(async () => {
    if (!runtime || !verified) return;
    const version = ++generation.current;
    setRefreshing(true);
    try {
      const next = await readSnapshot(runtime, verified.tokenAddress, selected, queue, account);
      if (generation.current !== version) return;
      setSnapshot(next); setFresh(true); setReadError('');
    } catch (e) { if (generation.current === version) { setReadError(errorMessage(e)); setFresh(false); } }
    finally { if (generation.current === version) setRefreshing(false); }
  }, [runtime, verified, selected, queue, account]);
  useEffect(() => {
    setFresh(false); void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { clearInterval(timer); generation.current++; };
  }, [refresh]);
  useEffect(() => {
    if (!runtime || !verified) return;
    return runtime.client.watchContractEvent({ address: runtime.canvas.address, abi: runtime.canvas.abi, eventName: 'Painted', poll: true,
      onLogs(logs) {
        if (!logs.length) return;
        setEventError(''); setFresh(false);
        const latest = logs.slice(-5).reverse().map(log => {
          const args = (log as unknown as { args: { index: bigint; price: bigint; painter: Address } }).args;
          return `Pixel ${args.index} painted by ${short(args.painter)} · ${amount(args.price, decimals)} PIXL`;
        });
        setActivity(previous => [...latest, ...previous].slice(0, 5)); void refresh();
      }, onError() { setEventError('Event updates unavailable. Contract views still refresh every 15 seconds.'); },
    });
  }, [runtime, verified, refresh, decimals]);
  useEffect(() => {
    const provider = window.ethereum;
    const changed = () => {
      setApproval(''); setFresh(false); setSnapshot(undefined); setAccount(undefined); setWalletChain(undefined);
      if (provider) void Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })])
        .then(([accounts, chain]) => { setAccount((accounts as Address[])[0]); setWalletChain(Number(chain)); }).catch(e => setError(errorMessage(e)));
    };
    provider?.on?.('accountsChanged', changed); provider?.on?.('chainChanged', changed); provider?.on?.('disconnect', changed);
    return () => { provider?.removeListener?.('accountsChanged', changed); provider?.removeListener?.('chainChanged', changed); provider?.removeListener?.('disconnect', changed); };
  }, []);

  async function walletAction(switching = false) {
    if (!runtime || busyRef.current) return;
    busyRef.current = true; setBusy('wallet'); setError('');
    try {
      if (switching) await switchNetwork(runtime);
      const wallet = runtime.wallet();
      const accounts = await wallet.requestAddresses();
      setAccount(accounts[0]); setWalletChain(await wallet.getChainId()); setApproval('');
      setStatus('Wallet connected. Review the live PIXL balance before painting.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(''); busyRef.current = false; }
  }
  function changeQueue(next: Pixel[]) { setQueue(next); setApproval(''); setFresh(false); }
  function select(index: number) { setSelected(index); setFresh(false); }
  function addPixel() {
    if (queue.length >= 64 || busy) return;
    changeQueue([...queue, { index: selected, colour }]);
    setStatus(`Pixel (${selected % 32}, ${Math.floor(selected / 32)}) added. ${queue.length + 1} of 64 queued.`);
  }
  async function transact(kind: 'approve' | 'paint' | 'withdraw') {
    if (!runtime || !verified || !account || !ready || busyRef.current) return;
    if (kind !== 'withdraw' && (!queue.length || total === undefined || !funded)) return;
    if (kind === 'paint' && !approved) return;
    busyRef.current = true; setBusy(kind); setError(''); setHash(undefined);
    let submitted = false;
    try {
      setStatus('Checking the current price and simulating your transaction…');
      const wallet = await assertWallet(runtime, account);
      await verifyRuntime(runtime);
      const current = await readSnapshot(runtime, verified.tokenAddress, selected, queue, account);
      const cost = queueCost(queue, current.prices, verified.maxPrice);
      if (kind !== 'withdraw' && cost !== total) { setApproval(''); setSnapshot(current); throw Error('The pixel price changed. Review the new total, then approve again.'); }
      if (kind === 'withdraw' && !current.withdrawable) throw Error('There is no PIXL available to withdraw. Refresh after another player repaints your pixel.');
      if (kind === 'paint' && ((current.allowance ?? 0n) < total! || (current.balance ?? 0n) < total!)) throw Error('PIXL balance or allowance changed. Refresh and approve the draft again.');
      const call = kind === 'approve'
        ? { address: verified.tokenAddress, abi: runtime.token.abi, functionName: 'approve', args: [runtime.canvas.address, total!] }
        : kind === 'withdraw' ? { ...runtime.canvas, functionName: 'withdraw', args: [] }
        : queue.length === 1 ? { ...runtime.canvas, functionName: 'paint', args: [BigInt(queue[0].index), Number.parseInt(queue[0].colour.slice(1), 16)] }
        : { ...runtime.canvas, functionName: 'paintBatch', args: [queue.map(p => BigInt(p.index)), queue.map(p => Number.parseInt(p.colour.slice(1), 16))] };
      const simulation = await runtime.client.simulateContract({ ...call, account });
      await assertWallet(runtime, account);
      setStatus(`Confirm ${kind === 'approve' ? `approval of exactly ${amount(total, decimals)} PIXL to PixelCanvas` : kind === 'paint' ? `painting ${queue.length} pixel${queue.length === 1 ? '' : 's'} for ${amount(total, decimals)} PIXL` : `withdrawal of ${amount(current.withdrawable, decimals)} PIXL`} in your wallet. Gas is paid in ${runtime.deployment.network.nativeCurrency.symbol}.`);
      const tx = await wallet.writeContract(simulation.request); submitted = true; setHash(tx);
      setStatus('Transaction submitted. Waiting for confirmation…');
      let replaced = false;
      const receipt = await runtime.client.waitForTransactionReceipt({ hash: tx, timeout: 180000,
        onReplaced(update) { setHash(update.transaction.hash); if (update.reason !== 'repriced') replaced = true; },
      });
      if (replaced) { setApproval(''); await refresh(); throw Error('Your wallet replaced or cancelled the requested transaction. Review the explorer and refresh state before retrying.'); }
      if (receipt.status !== 'success') throw Error('Transaction reverted. No canvas change was made; check the explorer and refresh before retrying.');
      if (accountRef.current === account) {
        if (kind === 'approve') setApproval(draftKey);
        if (kind === 'paint') changeQueue([]);
      }
      setStatus(kind === 'approve' ? 'Approval confirmed. Review the draft, then paint.' : kind === 'paint' ? 'Paint confirmed. Your pixels are on the wall.' : 'Withdrawal confirmed. PIXL returned to your wallet.');
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      setStatus(submitted ? 'Check the transaction on the explorer before retrying. Confirmation may still be pending.' : 'No transaction was submitted by this request. Your draft is saved on this page.');
    } finally { setBusy(''); busyRef.current = false; }
  }

  return <>
    <a className="skip" href="#studio">Skip to canvas</a>
    <header className="site-header wrap">
      <a className="brand" href="#"><span className="pixel-mark" aria-hidden="true"><i /><i /><i /><i /></span>Pixel Wall<span className="brand-note">A public canvas</span></a>
      <div className="header-actions"><span className="network-badge"><span aria-hidden="true">◈</span> {runtime?.deployment.network.name ?? 'Loading network'} · Testnet</span>
        <button className="wallet-button" disabled={!runtime || !!busy} onClick={() => void walletAction()}>{account ? short(account) : busy === 'wallet' ? 'Connecting…' : 'Connect wallet'}<span aria-hidden="true"> ↗</span></button></div>
    </header>
    <main className="wrap" id="studio">
      <section className="intro"><div><p className="eyebrow">1,024 pixels. Room for everyone.</p><h1>A little colour.<br />A shared canvas.</h1></div><p className="intro-copy">Make your mark, one pixel at a time.<br />Pick a colour, find a spot, and paint with PIXL.<span>Every mark lives on Sepolia.</span></p></section>
      {readError && <div className="notice error" role="alert"><strong>Live state unavailable</strong><p>{readError}</p><button onClick={() => void (verified ? refresh() : initialize())}>Retry connection</button></div>}
      {account && !correctChain && <div className="notice" role="status"><strong>Switch networks to paint.</strong><p>Your wallet is on a different network. This wall lives on {runtime?.deployment.network.name}.</p><button disabled={!!busy} onClick={() => void walletAction(true)}>Switch to {runtime?.deployment.network.name}</button></div>}
      <div className="workspace">
        <section className="canvas-section" aria-labelledby="canvas-heading">
          <div className="section-heading"><h2 id="canvas-heading">The wall <span className="subtle">/ 32 × 32</span></h2><span className="live-label">{fresh ? '● Live' : snapshot ? '○ Updating' : '○ Connecting'}</span></div>
          <div className="canvas-frame"><div className="ruler"><span>0, 0</span><span>31, 0</span></div>
            <Canvas colours={snapshot?.colours} selected={selected} queue={queue} onSelect={select} />
            <div className="ruler"><span>0, 31</span><span>31, 31</span></div>
          </div>
          <div className="canvas-caption"><p id="canvas-instructions">Select a pixel or use the coordinate fields.<br /><span className="subtle">Arrow keys move the selection. Dashed pixels are your draft.</span></p><button className="quiet" onClick={() => void refresh()} disabled={!verified || refreshing || !!busy}>{refreshing ? 'Refreshing…' : 'Refresh ↻'}</button></div>
          <div className="canvas-facts"><div><span className="eyebrow">Starting price</span><strong>10 <small>PIXL / pixel</small></strong></div><div><span className="eyebrow">Every repaint</span><strong>+10% <small>next price</small></strong></div><div><span className="eyebrow">Your draft</span><strong>{queue.length.toString().padStart(2, '0')} <small>/ 64 pixels</small></strong></div></div>
        </section>
        <aside className="editor" aria-label="Paint controls">
          <div className="editor-top"><span className="eyebrow">Your toolkit</span><span className="tiny-grid" aria-hidden="true">▦</span></div>
          <section className="editor-section" aria-labelledby="colour-heading"><h2 id="colour-heading"><span className="step">01</span> Pick a colour</h2><div className="swatches">{swatches.map(s => <button key={s} className={`swatch ${colour === s ? 'chosen' : ''}`} style={{ backgroundColor: s }} aria-label={`Use colour ${s}`} aria-pressed={colour === s} disabled={!!busy} onClick={() => setColour(s)}><span style={{ color: s === '#000000' || s === '#2a4bd7' || s === '#8556b8' || s === '#2b805d' ? '#fff' : '#111' }}>{colour === s ? '✓' : ''}</span></button>)}</div><div className="custom-colour"><label htmlFor="colour">Custom colour</label><div><input id="colour" type="color" value={colour} disabled={!!busy} onChange={e => setColour(e.target.value)} /><code>{colour.toUpperCase()}</code></div></div></section>
          <section className="editor-section" aria-labelledby="pixel-heading"><h2 id="pixel-heading"><span className="step">02</span> Find your spot</h2><div className="coordinate-fields">{['Column (x)', 'Row (y)'].map((label, i) => <label key={label}>{label}<input type="number" min="0" max="31" step="1" inputMode="numeric" disabled={!!busy} value={i ? Math.floor(selected / 32) : selected % 32} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= 31) select(i ? n * 32 + selected % 32 : Math.floor(selected / 32) * 32 + n); }} /></label>)}</div>
            <dl className="pixel-details"><div><dt>Current price</dt><dd>{fresh ? amount(snapshot?.prices[selected], decimals) : '…'} PIXL</dd></div><div><dt>Last painter</dt><dd>{snapshot && fresh ? snapshot.painter === zeroAddress ? 'Unpainted' : <a href={`${explorer}/address/${snapshot.painter}`} title={snapshot.painter} target="_blank" rel="noreferrer">{short(snapshot.painter)}</a> : '…'}</dd></div></dl>
            <button className="add-button" onClick={addPixel} disabled={queue.length >= 64 || !!busy}>＋ {queue.length >= 64 ? 'Queue full · 64 pixels' : 'Add pixel to queue'}</button></section>
          <section className="editor-section queue-section" aria-labelledby="queue-heading"><div className="section-heading"><h2 id="queue-heading"><span className="step">03</span> Review & paint</h2>{queue.length > 0 && <button className="quiet" disabled={!!busy} onClick={() => changeQueue([])}>Clear</button>}</div>
            {queue.length ? <ol className="queue-list" aria-label="Queued pixels">{queue.map((pixel, i) => <li key={i}><span className="queue-colour" style={{ backgroundColor: pixel.colour }} aria-hidden="true" /><span>({pixel.index % 32}, {Math.floor(pixel.index / 32)}) <code>{pixel.colour.toUpperCase()}</code></span><button aria-label={`Remove queued pixel ${i + 1}`} disabled={!!busy} onClick={() => changeQueue(queue.filter((_, n) => i !== n))}>×</button></li>)}</ol> : <p className="empty-queue">Your next mark starts here.<br /><span>Add a pixel to preview your draft.</span></p>}
            <div className="total-row"><span>Total <small>{queue.length} queued</small></span><strong data-testid="total">{queue.length ? fresh ? amount(total, decimals) : '…' : '0'} <small>PIXL</small></strong></div>
            <div className="payment-buttons"><button className={!approved ? 'primary' : ''} disabled={!ready || !queue.length || !funded || approved} onClick={() => void transact('approve')}>{busy === 'approve' ? 'Approving…' : approved ? '✓ Approval confirmed' : '1. Approve PIXL'}</button><button className={approved ? 'primary' : ''} disabled={!ready || !queue.length || !approved || !funded} onClick={() => void transact('paint')}>{busy === 'paint' ? 'Painting…' : `2. Paint ${queue.length || ''} pixel${queue.length === 1 ? '' : 's'}`}</button></div>
            <p className="action-hint">{!account ? 'Connect a wallet to approve and paint.' : !correctChain ? 'Switch to Sepolia to continue.' : !fresh ? 'Waiting for current prices and balances.' : queue.length && !funded ? 'You need more PIXL for this draft.' : approved ? 'Painting spends the displayed total and changes the shared wall.' : 'Approve exactly the draft total, then confirm your paint.'}</p>
          </section>
        </aside>
      </div>
      <section className="wallet-panel" aria-labelledby="wallet-heading"><div><p className="eyebrow" id="wallet-heading">Your PIXL</p><p>{account ? <a className="account-address" href={`${explorer}/address/${account}`} target="_blank" rel="noreferrer">{account}</a> : 'Connect your wallet to see your balances.'}</p></div><div className="balance-items"><div><span>Wallet balance</span><strong data-testid="balance">{amount(snapshot?.balance, decimals)} <small>PIXL</small></strong></div><div><span>Canvas allowance</span><strong data-testid="allowance">{amount(snapshot?.allowance, decimals)} <small>PIXL</small></strong></div><div><span>Withdrawable</span><strong data-testid="withdrawable">{amount(snapshot?.withdrawable, decimals)} <small>PIXL</small></strong></div><button disabled={!ready || !snapshot?.withdrawable} onClick={() => void transact('withdraw')}>{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw PIXL ↗'}</button></div>{snapshot && !fresh && <p className="action-hint">Balances are updating; transactions are disabled until refreshed.</p>}</section>
      <div className="transaction-status" aria-live="polite" role="status"><span aria-hidden="true">↳ </span>{status}{hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer"> View transaction ↗</a>}</div>
      {error && <div className="notice error" role="alert"><p>{error}</p><button onClick={() => setError('')}>Dismiss message</button></div>}
      <section className="how-it-works" aria-labelledby="how-heading"><h2 id="how-heading">A small mark.<br /> A lasting exchange.</h2><div><h3>Paint with PIXL</h3><p>Get PIXL by swapping Sepolia ETH in the launch pool. This page doesn’t offer swaps. Add up to 64 pixels and approve the total before you paint.</p></div><div><h3>Leave a little behind</h3><p>The first paint burns its full price. A repaint credits half, rounded down, to the last painter and burns the rest. Collect your credits with Withdraw.</p></div><div><h3>Make room for the next</h3><p>A pixel’s price rises 10% after each paint, rounded down, up to 1,000,000 PIXL. Repeated pixels in a batch are priced in order. Network gas is extra.</p></div></section>
      <details className="activity"><summary>Live activity & contract details</summary><p>Painted events received while this page is open. Views refresh every 15 seconds.</p>{eventError && <p role="status">{eventError}</p>}{activity.length ? <ul>{activity.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>No paint events received in this session.</p>}<p>Read block: {snapshot?.block.toString() ?? 'Waiting for RPC'}</p><div className="contract-links">{runtime?.deployment.contracts.map(contract => <a key={contract.name} href={`${explorer}/address/${contract.address}`} target="_blank" rel="noreferrer">{contract.name} <code>{contract.address}</code> ↗</a>)}</div><p>Allowances shown here are for PixelCanvas. The approval step replaces that allowance with the exact draft cost. A price change requires a new review and approval.</p></details>
    </main>
    <footer className="wrap"><span>Pixel Wall <span className="subtle">· Made together, onchain.</span></span><span>Sepolia testnet · Test tokens only</span></footer>
  </>;
}
