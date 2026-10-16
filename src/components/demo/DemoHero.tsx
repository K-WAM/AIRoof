// The /try/roofing hero: Alice's voice orb with flowing waves (pure SVG + CSS, no client JS).
// Each wave is a chain of parabolic arcs with period L, so sliding it left by exactly L loops seamlessly.
import { Mic } from "lucide-react";

const W = 560, H = 200, MID = 86; // waves pass behind the orb, above the caption

function wavePath(period: number, amplitude: number, phase: number): string {
  const half = period / 2;
  let x = -period - phase;
  let d = `M${x} ${MID} Q${x + half / 2} ${MID - 2 * amplitude} ${x + half} ${MID}`;
  for (x += half; x < W + period; x += half) d += ` T${x + half} ${MID}`;
  return d;
}

const WAVES = [
  { period: 280, amp: 34, phase: 0, dur: 9, breathe: 5, width: 1.6, opacity: 0.9, color: "#2dd4bf" },
  { period: 280, amp: 26, phase: 70, dur: 11, breathe: 6.5, width: 1.2, opacity: 0.7, color: "#38bdf8" },
  { period: 280, amp: 40, phase: 140, dur: 13, breathe: 7, width: 1, opacity: 0.5, color: "#a78bfa" },
  { period: 140, amp: 14, phase: 35, dur: 7, breathe: 4.5, width: 1, opacity: 0.55, color: "#5eead4" },
  { period: 186.6667, amp: 22, phase: 90, dur: 10, breathe: 8, width: 1.2, opacity: 0.6, color: "#2dd4bf" },
  { period: 560, amp: 46, phase: 200, dur: 17, breathe: 9, width: 1, opacity: 0.4, color: "#818cf8" },
];

const CSS = `
.demo-hero{position:relative;height:200px;margin:0 0 22px;border-radius:18px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 50%,#12343a 0%,#0b1d24 55%,#081419 100%);box-shadow:0 10px 30px rgba(8,20,25,.25)}
.demo-hero svg{position:absolute;inset:0;width:100%;height:100%}
.demo-hero .wave{animation:demo-hero-slide linear infinite}
.demo-hero .breathe{transform-box:view-box;transform-origin:50% 43%;animation:demo-hero-breathe ease-in-out infinite alternate}
.demo-hero-orb{position:absolute;left:50%;top:43%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;display:grid;place-items:center;color:#fff;
  background:radial-gradient(circle at 35% 30%,#99f6e4 0%,#2dd4bf 30%,#0f766e 70%,#0b3b3a 100%);
  box-shadow:0 0 24px rgba(45,212,191,.65),0 0 60px rgba(45,212,191,.3)}
.demo-hero-orb::before,.demo-hero-orb::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(45,212,191,.6);animation:demo-hero-ring 2.8s ease-out infinite}
.demo-hero-orb::after{animation-delay:1.4s}
.demo-hero-caption{margin:0;position:absolute;left:0;right:0;bottom:22px;height:22px;text-align:center;color:#e6fffb;font-size:15px;font-weight:500;letter-spacing:.01em}
.demo-hero-caption span{position:absolute;left:0;right:0;opacity:0;animation:demo-hero-say 8s ease-in-out infinite}
.demo-hero-caption span:last-child{animation-delay:4s}
@keyframes demo-hero-slide{from{transform:translateX(0)}to{transform:translateX(calc(-1px * var(--period)))}}
@keyframes demo-hero-breathe{from{transform:scaleY(.55)}to{transform:scaleY(1.1)}}
@keyframes demo-hero-ring{from{transform:scale(1);opacity:.8}to{transform:scale(1.9);opacity:0}}
@keyframes demo-hero-say{0%,5%{opacity:0;transform:translateY(4px)}12%,43%{opacity:1;transform:none}50%,100%{opacity:0;transform:translateY(-4px)}}
@media (max-width:480px){.demo-hero{height:170px}.demo-hero-orb{width:64px;height:64px;margin:-32px 0 0 -32px}}
@media (prefers-reduced-motion:reduce){.demo-hero *,.demo-hero *::before,.demo-hero *::after{animation:none!important}
  .demo-hero-caption span:first-child{opacity:1}}
`;

export function DemoHero() {
  return <div className="demo-hero" data-testid="demo-hero">
    <style>{CSS}</style>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="demo-hero-fade" x1="0" x2={W} y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.28" stopColor="#fff" />
          <stop offset="0.72" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="demo-hero-mask"><rect width={W} height={H} fill="url(#demo-hero-fade)" /></mask>
      </defs>
      <g mask="url(#demo-hero-mask)">
      {WAVES.map((w, i) => <g key={i} className="breathe" style={{ animationDuration: `${w.breathe}s`, animationDelay: `${-i * 1.3}s` }}>
        <g stroke={w.color} fill="none" strokeWidth={w.width} opacity={w.opacity}>
          <path className="wave" d={wavePath(w.period, w.amp, w.phase)}
            style={{ animationDuration: `${w.dur}s`, ["--period" as string]: w.period } as React.CSSProperties} />
        </g>
      </g>)}
      </g>
    </svg>
    <div className="demo-hero-orb"><Mic size={30} strokeWidth={1.75} aria-hidden="true" /></div>
    <p className="demo-hero-caption"><span>How can I help you?</span><span lang="es">¿En qué le puedo ayudar?</span></p>
  </div>;
}
