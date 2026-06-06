import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Zap, ZapOff } from 'lucide-react';
import { cn } from '../lib/utils';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 1200; // Pleasant high-pitch beep
    gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    console.warn("Web Audio beep failed", e);
  }
};

export const playErrorSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    // Soft gentle double-tone for "not found" instead of harsh sawtooth
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode1 = audioCtx.createGain();
    const gainNode2 = audioCtx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(320, now);
    gainNode1.gain.setValueAtTime(0.1, now);
    gainNode1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gainNode1);
    gainNode1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(240, now + 0.1);
    gainNode2.gain.setValueAtTime(0.1, now + 0.1);
    gainNode2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc2.connect(gainNode2);
    gainNode2.connect(audioCtx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  } catch (e) {
    console.warn("Web Audio error sound failed", e);
  }
};

export function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "html5qrcode-scanner-view";
  
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let qrScanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      try {
        // Safe timeout for component mount
        await new Promise(resolve => setTimeout(resolve, 250));
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(scannerId);
        qrScanner = html5QrCode;
        qrCodeRef.current = html5QrCode;

        const config: any = {
          fps: 30, // Max frame rate for speed
          aspectRatio: 1.333333,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true // Native high-performance platform decoder
          }
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (isMounted) {
              playBeep();
              onScanSuccess(decodedText);
            }
          },
          () => {
            // normal searching frame ignores
          }
        );

        if (isMounted) {
          setCameraActive(true);
          setInitError(null);
          // Check if torch/flashlight feature is present in running camera
          try {
            const capabilities = (html5QrCode as any).getRunningTrackCapabilities();
            if (capabilities && capabilities.torch) {
              setTorchSupported(true);
            }
          } catch (err) {
            console.warn("Could not inspect torch capability", err);
          }
        }
      } catch (err: any) {
        console.warn("Scanner initiation error:", err);
        if (isMounted) {
          setInitError(err?.message || 'Failed to access Camera. Please grant permissions and ensure you are using Google Chrome or Safari browser.');
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (qrScanner) {
        if (qrScanner.isScanning) {
          qrScanner.stop().catch(err => {
            console.warn("Dynamic scanner shutdown handled gracefully", err);
          });
        }
      }
    };
  }, [onScanSuccess]);

  const toggleTorch = async () => {
    if (!qrCodeRef.current || !torchSupported) return;
    try {
      const targetState = !torchOn;
      await qrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: targetState } as any]
      });
      setTorchOn(targetState);
    } catch (err) {
      console.warn("Failed to toggle flashlight", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[999] flex flex-col justify-between p-6 animate-fade-in text-white font-sans">
      <style>{`
        @keyframes scan-laser {
          0%, 100% { top: 8%; opacity: 0.3; }
          50% { top: 92%; opacity: 1; }
        }
        .laser-line {
          animation: scan-laser 2.2s ease-in-out infinite;
        }
      `}</style>

      {/* Top Header Panel */}
      <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        <h4 className="text-white font-black text-xs tracking-widest uppercase flex items-center gap-2">
          <Camera size={18} className="text-emerald-400 animate-pulse" />
          <span>BAZIMA BARCODE SCANNER</span>
        </h4>
        <div className="flex items-center gap-2">
          {torchSupported && cameraActive && (
            <button 
              onClick={toggleTorch}
              className={cn(
                "p-2.5 rounded-xl border transition-all active:scale-95 flex items-center justify-center",
                torchOn 
                  ? "bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20" 
                  : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
              )}
              title="Toggle Flashlight / Torch"
            >
              {torchOn ? <ZapOff size={18} /> : <Zap size={18} />}
            </button>
          )}
          <button 
            onClick={onClose} 
            className="bg-slate-800 hover:bg-slate-700 hover:text-red-400 text-white p-2.5 rounded-xl border border-slate-700 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Viewport Camera & overlay */}
      <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden rounded-[32px] border border-slate-800 bg-black shadow-2xl shadow-black/80">
        {initError ? (
          <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center space-y-4 bg-slate-900 z-50">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
              <Camera size={24} />
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-widest">Camera Access Denied</h4>
            <p className="text-xs text-slate-400 font-bold leading-relaxed">{initError}</p>
            <div className="mt-4 p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-[10px] text-slate-300 font-medium">
              <span className="text-amber-400 font-black">TIP:</span> If you opened this from a QR code scanner (like WhatsApp or Xiaomi Scanner), <strong>tap the 3-dots menu top right</strong> and choose <strong>"Open in Browser"</strong> or <strong>"Open in Chrome/Safari"</strong>.
            </div>
          </div>
        ) : (
          <>
            <div id={scannerId} className="w-full h-full [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover flex items-center justify-center overflow-hidden" />
            
            {/* Floating Futuristic viewfinder grids */}
            <div className="absolute pointer-events-none inset-0 flex items-center justify-center">
              <div className="border border-emerald-500/30 w-[84%] h-[46%] rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.06)] flex items-center justify-center relative">
                
                {/* Double thick neon corner brackets */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl -mt-[3px] -ml-[3px]" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl -mt-[3px] -mr-[3px]" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl -mb-[3px] -ml-[3px]" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl -mb-[3px] -mr-[3px]" />
                
                {/* Glowing Scan laser line */}
                <div className="absolute left-[5%] right-[5%] h-[3px] bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)] laser-line" />
                
                <div className="text-[9px] font-black tracking-widest text-emerald-400/50 absolute top-2 uppercase">ALIGN PRODUCT BARCODE</div>
              </div>
            </div>
          </>
        )}
        
        {/* Backdrop vignette mask */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-slate-950/40 pointer-events-none" />
      </div>

      {/* Instructional Bottom Banner */}
      <div className="text-center pb-4 space-y-1.5 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/40">
        <p className="text-slate-200 text-xs font-black uppercase tracking-widest animate-pulse">Scanning Live...</p>
        <p className="text-slate-400 text-[10px] leading-relaxed uppercase max-w-xs mx-auto">
          Keep barcode level inside the visual guidelines. Use flashlight button if lighting is low.
        </p>
      </div>
    </div>
  );
}
