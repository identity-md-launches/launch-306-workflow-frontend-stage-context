import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Pixel } from './model';

export function Canvas({ colours, queue, selected, onSelect }: { colours?: string[]; queue: Pixel[]; selected: number; onSelect: (index: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    context.fillStyle = '#101112';
    context.fillRect(0, 0, 640, 640);
    if (colours) colours.forEach((colour, i) => { context.fillStyle = colour; context.fillRect((i % 32) * 20, Math.floor(i / 32) * 20, 20, 20); });
    queue.forEach(pixel => { context.fillStyle = pixel.colour; context.fillRect((pixel.index % 32) * 20, Math.floor(pixel.index / 32) * 20, 20, 20); });
    context.strokeStyle = '#ffffff26';
    context.lineWidth = 1;
    for (let i = 1; i < 32; i++) { context.beginPath(); context.moveTo(i * 20, 0); context.lineTo(i * 20, 640); context.moveTo(0, i * 20); context.lineTo(640, i * 20); context.stroke(); }
    queue.forEach(pixel => { context.strokeStyle = '#fff'; context.setLineDash([3, 3]); context.strokeRect((pixel.index % 32) * 20 + 3, Math.floor(pixel.index / 32) * 20 + 3, 14, 14); });
    context.setLineDash([]);
    context.lineWidth = 3;
    context.strokeStyle = '#fff';
    context.strokeRect((selected % 32) * 20 + 2, Math.floor(selected / 32) * 20 + 2, 16, 16);
    context.lineWidth = 1;
    context.strokeStyle = '#000';
    context.strokeRect((selected % 32) * 20 + 4, Math.floor(selected / 32) * 20 + 4, 12, 12);
  }, [colours, queue, selected]);
  const keyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const x = selected % 32, y = Math.floor(selected / 32);
    const next = { ArrowLeft: y * 32 + Math.max(0, x - 1), ArrowRight: y * 32 + Math.min(31, x + 1), ArrowUp: Math.max(0, y - 1) * 32 + x, ArrowDown: Math.min(31, y + 1) * 32 + x }[event.key];
    if (next !== undefined) { event.preventDefault(); onSelect(next); }
  };
  return <canvas ref={ref} width="640" height="640" tabIndex={0} role="img"
    aria-label={`Shared pixel canvas. Selected column ${selected % 32}, row ${Math.floor(selected / 32)}.`}
    aria-describedby="canvas-instructions" onKeyDown={keyboard}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onSelect(Math.min(31, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * 32))) * 32 + Math.min(31, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * 32)))); }}>
    Use the column and row fields to select a pixel. The canvas contains 1,024 RGB pixels.
  </canvas>;
}
