import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Sparkles, Flame, Volume2, VolumeX, ShieldCheck } from 'lucide-react';

interface RobotLoaderProps {
  message?: string;
  subMessage?: string;
}

const FUN_MESSAGES = [
  "Bhaag Robot Bhaag! 🏃‍♂️💨",
  "Rocket Boost Activated! 🚀",
  "Super Fast Dukaan Pro! ⚡",
  "Syncing Data at Light Speed! 🤖💥",
  "Power Level 9000! 🔥",
  "Hyper Jump Executed! 🌌",
  "Full Speed Ahead! 🏎️💨",
  "Dukaan Data Synchronized! 📦",
  "Turbo Mode 100%! ⚡⚡"
];

export function RobotLoader({ 
  message = "Dukaan Pro Load Ho Raha Hai...", 
  subMessage = "Plese wait, system setup ho raha hai" 
}: RobotLoaderProps) {
  const [clickCount, setClickCount] = useState(0);
  const [isJumping, setIsJumping] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<string | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play sci-fi jump audio synthesized with Web Audio API
  const playJumpSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pitch ramp up (laser jump effect)
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(300 + clickCount * 20, now);
      osc.frequency.exponentialRampToValueAtTime(800 + clickCount * 30, now + 0.18);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.log('Audio playback restricted', e);
    }
  };

  const handleRobotClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isJumping) return;

    // Trigger haptic vibration if supported
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([20, 30, 20]); } catch (_) {}
    }

    setIsJumping(true);
    const newCount = clickCount + 1;
    setClickCount(newCount);
    setSpeedMultiplier(prev => Math.min(prev + 0.3, 2.5));

    // Play jump audio
    playJumpSound();

    // Pick fun message
    const randomMsg = FUN_MESSAGES[Math.floor(Math.random() * FUN_MESSAGES.length)];
    setCurrentQuote(`${randomMsg} (Boost #${newCount})`);

    // Create click spark particles
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newSparks = Array.from({ length: 8 }).map((_, i) => ({
      id: Date.now() + i,
      x: clickX + (Math.random() - 0.5) * 60,
      y: clickY + (Math.random() - 0.5) * 60,
      color: ['#38bdf8', '#34d399', '#f43f5e', '#fbbf24', '#a855f7'][i % 5]
    }));
    setSparks(prev => [...prev, ...newSparks]);

    // Cleanup sparks
    setTimeout(() => {
      setSparks(prev => prev.filter(s => !newSparks.includes(s)));
    }, 800);

    // Reset jump stance
    setTimeout(() => {
      setIsJumping(false);
    }, 600);

    // Slowly decay speed multiplier back after boost
    setTimeout(() => {
      setSpeedMultiplier(prev => Math.max(1, prev - 0.2));
    }, 2000);
  };

  // Visor emotion changes on click
  const getVisorEye = () => {
    if (isJumping) return "^ _ ^";
    if (clickCount > 10) return "🔥 _ 🔥";
    if (clickCount > 5) return "⚡ _ ⚡";
    return "• _ •";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden select-none font-sans">
      {/* Background Cyber Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f2b26_1px,transparent_1px),linear-gradient(to_bottom,#0f2b26_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40 pointer-events-none" />

      {/* Ambient Glowing Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/15 rounded-full blur-2xl pointer-events-none" />

      {/* Sound Toggle Button Top Right */}
      <button 
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="absolute top-6 right-6 z-30 p-3 bg-slate-900/80 border border-emerald-500/30 rounded-2xl text-emerald-400 hover:bg-slate-800 transition-all flex items-center gap-2 text-xs font-bold shadow-lg backdrop-blur-md"
        title="Toggle Audio Effects"
      >
        {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-slate-500" />}
        <span className="hidden sm:inline">{soundEnabled ? "Sound ON" : "Mute"}</span>
      </button>

      {/* Main Interactive Stage */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center">
        
        {/* Floating Interactive Callout */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.2 }}
          className="mb-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] backdrop-blur-md cursor-pointer"
        >
          <Sparkles size={14} className="animate-spin text-amber-300" />
          <span>ROBOT PAR CLICK KARO! 👆</span>
          <Zap size={14} className="text-emerald-400" />
        </motion.div>

        {/* Floating Quote Popup */}
        <AnimatePresence>
          {currentQuote && (
            <motion.div 
              key={currentQuote + clickCount}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: -10 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              className="absolute -top-12 z-20 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-xs rounded-2xl shadow-2xl border border-white/30 whitespace-nowrap"
            >
              {currentQuote}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-teal-600 rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* CLICKABLE ROBOT CONTAINER */}
        <div 
          onClick={handleRobotClick}
          className="relative cursor-pointer group my-4 p-8 transition-transform active:scale-95"
          title="Click to Boost Robot Speed!"
        >
          {/* Sparkle particles on click */}
          {sparks.map(s => (
            <motion.div
              key={s.id}
              initial={{ opacity: 1, scale: 1, x: s.x, y: s.y }}
              animate={{ opacity: 0, scale: 2.5, y: s.y - 40, x: s.x + (Math.random() - 0.5) * 40 }}
              transition={{ duration: 0.6 }}
              className="absolute w-3 h-3 rounded-full z-30 pointer-events-none"
              style={{ backgroundColor: s.color, boxShadow: `0 0 10px ${s.color}` }}
            />
          ))}

          {/* Jetpack Flame / Dust Trail */}
          <div className="absolute bottom-10 left-10 z-0 flex items-center">
            <motion.div 
              animate={{ 
                scaleX: [1, 1.8 * speedMultiplier, 1],
                opacity: [0.6, 1, 0.6] 
              }}
              transition={{ repeat: Infinity, duration: 0.15 / speedMultiplier }}
              className="w-12 h-4 bg-gradient-to-r from-transparent via-amber-500 to-rose-500 rounded-full blur-sm transform -rotate-12"
            />
            <motion.div 
              animate={{ 
                x: [-10, -40 * speedMultiplier], 
                opacity: [1, 0],
                scale: [0.5, 1.5]
              }}
              transition={{ repeat: Infinity, duration: 0.3 / speedMultiplier }}
              className="w-4 h-4 bg-emerald-400/80 rounded-full blur-xs"
            />
          </div>

          {/* THE ROBOT SVG */}
          <motion.div
            animate={isJumping ? {
              y: [-10, -70, -10],
              rotate: [0, -360, 0],
              scale: [1, 1.15, 1]
            } : {
              y: [0, -6, 0],
              rotate: [0, 1, 0]
            }}
            transition={isJumping ? {
              duration: 0.55,
              ease: "easeInOut"
            } : {
              repeat: Infinity,
              duration: 0.35 / speedMultiplier,
              ease: "easeInOut"
            }}
            className="relative z-10 w-36 h-36 flex items-center justify-center filter drop-shadow-[0_10px_20px_rgba(16,185,129,0.4)]"
          >
            <svg viewBox="0 0 120 120" className="w-full h-full">
              <defs>
                <linearGradient id="botMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="50%" stopColor="#059669" />
                  <stop offset="100%" stopColor="#022c22" />
                </linearGradient>
                <linearGradient id="visorGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00f2fe" />
                  <stop offset="100%" stopColor="#4facfe" />
                </linearGradient>
                <radialGradient id="coreLight" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6EE7B7" />
                  <stop offset="100%" stopColor="#059669" />
                </radialGradient>
              </defs>

              {/* Antenna */}
              <line x1="60" y1="18" x2="60" y2="8" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
              <circle cx="60" cy="6" r="4" fill="#fbbf24" className="animate-ping" />
              <circle cx="60" cy="6" r="4" fill="#f59e0b" />

              {/* Head */}
              <rect x="35" y="18" width="50" height="34" rx="10" fill="url(#botMetal)" stroke="#a7f3d0" strokeWidth="1.5" />
              {/* Ears / Side Screws */}
              <rect x="29" y="28" width="6" height="14" rx="2" fill="#047857" />
              <rect x="85" y="28" width="6" height="14" rx="2" fill="#047857" />

              {/* Visor Screen */}
              <rect x="41" y="24" width="38" height="22" rx="6" fill="#0f172a" stroke="#065f46" strokeWidth="1" />
              
              {/* Digital Eyes / Expression */}
              <text 
                x="60" 
                y="39" 
                textAnchor="middle" 
                fill="#38bdf8" 
                fontSize="11" 
                fontWeight="900" 
                fontFamily="monospace"
                className="select-none"
              >
                {getVisorEye()}
              </text>

              {/* Body */}
              <rect x="38" y="54" width="44" height="38" rx="8" fill="url(#botMetal)" stroke="#6ee7b7" strokeWidth="1.5" />

              {/* Chest Power Reactor Core */}
              <circle cx="60" cy="72" r="9" fill="url(#coreLight)" className="animate-pulse" />
              <polygon points="60,67 64,75 56,75" fill="#ffffff" opacity="0.9" />

              {/* Jetpack Strapped on Back */}
              <rect x="26" y="58" width="12" height="26" rx="4" fill="#1e293b" stroke="#334155" />

              {/* Running Arms */}
              {/* Left Arm (Swinging Opposite) */}
              <g className="origin-[42px_58px]">
                <line x1="38" y1="58" x2="26" y2="72" stroke="#34d399" strokeWidth="5" strokeLinecap="round" />
                <circle cx="24" cy="74" r="4" fill="#fbbf24" />
              </g>

              {/* Right Arm */}
              <g className="origin-[78px_58px]">
                <line x1="82" y1="58" x2="94" y2="70" stroke="#34d399" strokeWidth="5" strokeLinecap="round" />
                <circle cx="96" cy="72" r="4" fill="#fbbf24" />
              </g>

              {/* Running Legs Cycling Animation */}
              {/* Left Leg */}
              <line x1="48" y1="92" x2="38" y2="108" stroke="#059669" strokeWidth="6" strokeLinecap="round" />
              <rect x="30" y="106" width="14" height="6" rx="2" fill="#fbbf24" />

              {/* Right Leg */}
              <line x1="72" y1="92" x2="82" y2="108" stroke="#047857" strokeWidth="6" strokeLinecap="round" />
              <rect x="78" y="106" width="14" height="6" rx="2" fill="#f59e0b" />
            </svg>
          </motion.div>

          {/* Fast Moving Ground Track & Grid Lines */}
          <div className="w-48 h-3 relative overflow-hidden mt-1 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500/30">
            <motion.div
              animate={{ x: [0, -32] }}
              transition={{
                repeat: Infinity,
                duration: 0.3 / speedMultiplier,
                ease: "linear"
              }}
              className="absolute inset-0 flex items-center gap-3 w-[200%]"
            >
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-5 h-1 bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full shrink-0" />
              ))}
            </motion.div>
          </div>
        </div>

        {/* Boost Level / Speed HUD */}
        <div className="flex items-center gap-3 mt-2 px-4 py-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs font-mono shadow-inner">
          <div className="flex items-center gap-1 text-emerald-400 font-bold">
            <Flame size={14} className="text-amber-400 animate-bounce" />
            <span>Speed: {(speedMultiplier * 100).toFixed(0)}%</span>
          </div>
          <div className="w-[1px] h-4 bg-slate-700" />
          <div className="flex items-center gap-1 text-amber-300 font-bold">
            <Zap size={14} />
            <span>Clicks: {clickCount}</span>
          </div>
        </div>

        {/* Primary Loading Message */}
        <div className="mt-6 space-y-2">
          <h3 className="text-xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <span>{message}</span>
          </h3>
          <p className="text-xs text-emerald-400/80 font-medium max-w-xs mx-auto">
            {subMessage}
          </p>
        </div>

        {/* Animated Progress Bar */}
        <div className="w-64 h-2.5 bg-slate-900 rounded-full mt-5 overflow-hidden border border-emerald-500/30 p-0.5 shadow-lg">
          <motion.div
            animate={{ 
              x: ['-100%', '100%']
            }}
            transition={{
              repeat: Infinity,
              duration: 1.2 / speedMultiplier,
              ease: "easeInOut"
            }}
            className="w-1/2 h-full bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-400 rounded-full shadow-[0_0_12px_#34d399]"
          />
        </div>

        {/* Security / Quality Badge Footnote */}
        <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          <ShieldCheck size={12} className="text-emerald-500" />
          <span>Dukaan Pro Cloud POS • Secure & Encrypted</span>
        </div>

      </div>
    </div>
  );
}
