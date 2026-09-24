import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User, PhoneCall } from 'lucide-react';
import { CallSession } from '../types';
import { webrtcService } from '../lib/webrtcService';
import { cn } from '../lib/utils';

interface VoiceCallModalProps {
  currentCall: CallSession | null;
  incomingCall: CallSession | null;
  currentUserId: string;
  onAcceptIncoming: () => void;
  onRejectIncoming: () => void;
  onEndCall: () => void;
}

export function VoiceCallModal({
  currentCall,
  incomingCall,
  currentUserId,
  onAcceptIncoming,
  onRejectIncoming,
  onEndCall
}: VoiceCallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const activeCall = currentCall || incomingCall;
  const isIncoming = Boolean(incomingCall && !currentCall);
  const isCaller = activeCall?.callerId === currentUserId;

  const otherPerson = isCaller
    ? {
        name: activeCall?.receiverName || 'User',
        phone: activeCall?.receiverPhone || '',
        photo: activeCall?.receiverPhoto
      }
    : {
        name: activeCall?.callerName || 'User',
        phone: activeCall?.callerPhone || '',
        photo: activeCall?.callerPhoto
      };

  // Call duration timer
  useEffect(() => {
    let timer: any = null;
    if (activeCall?.status === 'connected') {
      timer = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setDurationSeconds(0);
    }
    return () => clearInterval(timer);
  }, [activeCall?.status]);

  if (!activeCall) return null;

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    webrtcService.toggleMute(nextMuted);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-white shadow-2xl relative overflow-hidden flex flex-col items-center">
        
        {/* Background Ambient Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl" />

        {/* Top Status Header */}
        <div className="relative z-10 mb-6">
          <span className={cn(
            "text-xs px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm",
            isIncoming ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse" :
            activeCall.status === 'connected' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
            "bg-slate-800 text-slate-300 border border-slate-700 animate-pulse"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              activeCall.status === 'connected' ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
            )} />
            {isIncoming ? "Incoming Voice Call..." :
             activeCall.status === 'connected' ? `Live Call • ${formatDuration(durationSeconds)}` :
             activeCall.status === 'ringing' ? "Ringing..." : "Connecting..."}
          </span>
        </div>

        {/* Avatar with Animated Soundwave Rings */}
        <div className="relative my-4 flex items-center justify-center">
          {/* Animated Pulsing Rings */}
          {(activeCall.status === 'connected' || activeCall.status === 'ringing' || isIncoming) && (
            <>
              <div className="absolute w-36 h-36 rounded-full border border-emerald-500/20 animate-ping" />
              <div className="absolute w-44 h-44 rounded-full border border-emerald-500/10 animate-pulse" />
            </>
          )}

          <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-emerald-500/40 shadow-2xl bg-slate-800 flex items-center justify-center z-10">
            {otherPerson.photo ? (
              <img
                src={otherPerson.photo}
                alt={otherPerson.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white text-3xl font-black">
                {otherPerson.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="relative z-10 mt-3 mb-6">
          <h3 className="text-xl font-black tracking-tight text-white">{otherPerson.name}</h3>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">{otherPerson.phone || 'Dukaan Web Call'}</p>
        </div>

        {/* Action Controls */}
        <div className="relative z-10 w-full pt-4 flex items-center justify-center gap-6">
          {isIncoming ? (
            /* Incoming Call Actions (Accept / Reject) */
            <>
              <button
                onClick={onRejectIncoming}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex flex-col items-center justify-center shadow-lg transition-transform"
                title="Decline"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={onAcceptIncoming}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30 transition-transform animate-bounce"
                title="Accept Call"
              >
                <PhoneCall size={24} />
              </button>
            </>
          ) : (
            /* Active / Outgoing Call Actions (Mute, End) */
            <>
              <button
                onClick={handleToggleMute}
                disabled={activeCall.status !== 'connected'}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                  isMuted 
                    ? "bg-rose-600/30 text-rose-400 border border-rose-500/40" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                )}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                onClick={onEndCall}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform"
                title="End Call"
              >
                <PhoneOff size={26} />
              </button>
            </>
          )}
        </div>

        {/* Audio Wave Visualizer Indicator */}
        {activeCall.status === 'connected' && (
          <div className="flex items-center gap-1 mt-6 h-4">
            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2" />
            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-4 [animation-delay:0.1s]" />
            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-3 [animation-delay:0.2s]" />
            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-5 [animation-delay:0.3s]" />
            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2 [animation-delay:0.4s]" />
          </div>
        )}
      </div>
    </div>
  );
}
