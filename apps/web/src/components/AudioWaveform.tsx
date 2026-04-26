import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveformProps {
  /** 0..1 input level. */
  level: number;
  /** When true, animate even at low level (e.g. agent speaking). */
  active: boolean;
  className?: string;
  bars?: number;
  color?: string;
}

export function AudioWaveform({
  level,
  active,
  className,
  bars = 28,
  color = 'currentColor',
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valuesRef = useRef<number[]>(new Array(bars).fill(0.05));
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(level);
  const activeRef = useRef(active);

  levelRef.current = level;
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Generate next bar value (level + jitter when active)
      const baseline = activeRef.current
        ? Math.max(levelRef.current, 0.15) +
          (Math.random() - 0.5) * 0.25
        : levelRef.current * 1.2;
      const next = Math.max(0.04, Math.min(1, baseline));
      valuesRef.current = [...valuesRef.current.slice(1), next];

      const barW = w / bars;
      const innerW = barW * 0.55;
      const gap = barW - innerW;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i += 1) {
        const v = valuesRef.current[i];
        const barH = Math.max(2, v * h);
        const x = i * barW + gap / 2;
        const y = (h - barH) / 2;
        ctx.beginPath();
        const r = innerW / 2;
        ctx.roundRect(x, y, innerW, barH, r);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [bars, color]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('w-full h-16 text-primary', className)}
    />
  );
}
