import React, { useEffect, useRef, useState } from 'react';
import * as Html5QrcodeModule from 'html5-qrcode';
import { X, Camera, Zap, ZapOff } from 'lucide-react';
import { motion } from 'motion/react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeModule.Html5Qrcode | null>(null);
  const containerId = "reader";

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5QrcodeModule.Html5Qrcode(containerId);
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        const devices = await Html5QrcodeModule.Html5Qrcode.getCameras();
        if (devices && devices.length > 0 && isMounted) {
          // Prefer back camera
          const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
          
          await scanner.start(
            backCamera.id,
            {
              fps: 10,
              qrbox: { width: 250, height: 180 },
              aspectRatio: 1.0
            },
            (decodedText) => {
              onScan(decodedText);
              // Audio feedback
              try {
                const audio = document.createElement('audio');
                audio.src = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';
                audio.play().catch(() => {});
              } catch (e) {}
            },
            () => {
              // silent failure for frame-by-frame
            }
          );
        } else if (isMounted) {
          setErrorHeader("No camera detected on this device.");
        }
      } catch (err: any) {
        console.error("Failed to start scanner:", err);
        if (isMounted) {
          const errMsg = err?.message || String(err);
          if (err.name === 'NotAllowedError' || errMsg.toLowerCase().includes('permission')) {
            setErrorHeader("Camera permission denied.");
          } else if (errMsg.includes('Requested device not found') || errMsg.toLowerCase().includes('not found')) {
            setErrorHeader("Camera not found or already in use.");
          } else {
            setErrorHeader("Scanner failed to start.");
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(err => console.error("Stop error", err));
      }
    };
  }, [onScan]);

  const toggleTorch = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        const newState = !isTorchOn;
        // @ts-ignore
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: newState }]
        });
        setIsTorchOn(newState);
      }
    } catch (e) {
      console.warn("Torch not supported", e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[150] flex flex-col items-center justify-center">
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
        <h3 className="font-black text-white text-lg tracking-tight">Scanner</h3>
        <div className="flex gap-4">
          <button onClick={toggleTorch} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all">
            {isTorchOn ? <Zap size={24} fill="currentColor"/> : <ZapOff size={24}/>}
          </button>
          <button onClick={onClose} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90 transition-all">
            <X size={24} />
          </button>
        </div>
      </div>
      
      <div id={containerId} className="w-full h-full object-cover">
        {errorHeader && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-900">
            <Camera size={48} className="text-slate-500 mb-4" />
            <p className="text-white font-black text-xl mb-4">{errorHeader}</p>
            <p className="text-slate-400 text-sm mb-8">
              Make sure you have allowed camera permissions. If you are in the preview, try clicking "Open in New Tab".
            </p>
            <button 
              onClick={onClose}
              className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-emerald-900/50"
            >
              Close Scanner
            </button>
          </div>
        )}
      </div>
      
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="w-64 h-48 border-2 border-emerald-500 rounded-3xl relative">
          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
          
          <motion.div 
            animate={{ top: ['10%', '90%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute left-4 right-4 h-0.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
          />
        </div>
        <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-8 px-8 text-center backdrop-blur-sm bg-black/20 py-2 rounded-full">
          Align Barcode to Scan
        </p>
      </div>
    </div>
  );
}
