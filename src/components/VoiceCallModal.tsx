import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  RefreshCw, 
  PhoneCall, 
  ShieldCheck,
  Maximize2,
  AlertCircle
} from 'lucide-react';
import { CallSession } from '../types';
import { webrtcService } from '../lib/webrtcService';
import { cn } from '../lib/utils';
import { formatPhoneDisplay, isValidPhone } from './ChatHub';

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
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isPermissionBlocked, setIsPermissionBlocked] = useState(false);
  const [isRetryingMedia, setIsRetryingMedia] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const activeCall = currentCall || incomingCall;
  const isIncoming = Boolean(incomingCall && !currentCall);
  const isCaller = activeCall?.callerId === currentUserId;
  const isVideoCall = activeCall?.callType === 'video';

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

  // Register WebRTC Stream listeners and permission state
  useEffect(() => {
    webrtcService.setStreamCallbacks(
      (s) => setLocalStream(s),
      (s) => setRemoteStream(s)
    );

    setLocalStream(webrtcService.getLocalStream());
    setRemoteStream(webrtcService.getRemoteStream());
    setIsPermissionBlocked(webrtcService.isPermissionBlocked());

    webrtcService.setPermissionCallback((blocked) => {
      setIsPermissionBlocked(blocked);
    });

    return () => {
      webrtcService.setStreamCallbacks(null, null);
      webrtcService.setPermissionCallback(null);
    };
  }, [activeCall?.id]);

  // Bind local media stream to self video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoCall]);

  // Bind remote media stream to other person's video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isVideoCall]);

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

  const handleToggleVideo = () => {
    const nextOff = !isVideoOff;
    setIsVideoOff(nextOff);
    webrtcService.toggleVideo(!nextOff);
  };

  const handleSwitchCamera = async () => {
    setIsSwitchingCamera(true);
    try {
      const ok = await webrtcService.switchCamera();
      if (ok) {
        setIsFrontCamera(prev => !prev);
      }
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const handleRetryHardwareMedia = async () => {
    setIsRetryingMedia(true);
    try {
      const ok = await webrtcService.retryHardwareMedia();
      if (ok) {
        setIsPermissionBlocked(false);
      }
    } finally {
      setIsRetryingMedia(false);
    }
  };

  // ==========================================
  // 1. VIDEO CALL UI VIEW
  // ==========================================
  if (isVideoCall) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
        <div className="w-full h-full md:max-w-4xl md:h-[88vh] md:max-h-[750px] bg-slate-900 border-0 md:border border-slate-800 rounded-none md:rounded-3xl shadow-2xl relative overflow-hidden flex flex-col justify-between">
          
          {/* Main Remote Video Screen (Full Background) */}
          <div className="absolute inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
            {activeCall.status === 'connected' && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              /* Waiting / Ringing Screen for Video */
              <div className="flex flex-col items-center justify-center text-center p-6 z-10">
                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute w-36 h-36 rounded-full border border-teal-500/20 animate-ping" />
                  <div className="absolute w-44 h-44 rounded-full border border-teal-500/10 animate-pulse" />
                  <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-teal-500/50 shadow-2xl bg-slate-800 flex items-center justify-center z-10">
                    {otherPerson.photo ? (
                      <img
                        src={otherPerson.photo}
                        alt={otherPerson.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-teal-600 to-emerald-600 flex items-center justify-center text-white text-3xl font-black">
                        {otherPerson.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="text-2xl font-black text-white mt-2">{otherPerson.name}</h3>
                <p className="text-sm text-teal-400 font-bold mt-1">
                  {isIncoming ? "Incoming Video Call..." :
                   activeCall.status === 'ringing' ? "Ringing..." : "Connecting Video..."}
                </p>
              </div>
            )}
          </div>

          {/* Floating Self Camera View (Picture-in-Picture) */}
          {localStream && !isIncoming && (
            <div className="absolute top-4 right-4 z-20 w-28 h-38 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-slate-950/80 backdrop-blur-md">
              {!isVideoOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "w-full h-full object-cover",
                    isFrontCamera && "-scale-x-100" // Mirror front camera view
                  )}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 text-center bg-slate-900">
                  <VideoOff size={22} className="text-slate-500 mb-1" />
                  <span className="text-[10px] font-bold">Camera Off</span>
                </div>
              )}
              {/* Camera Indicator Overlay */}
              <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 text-[9px] font-bold text-white flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                You
              </div>
            </div>
          )}

          {/* Top Bar with Call Info */}
          <div className="relative z-10 p-4 md:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20 bg-slate-800 shrink-0">
                {otherPerson.photo ? (
                  <img src={otherPerson.photo} alt={otherPerson.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-teal-600 flex items-center justify-center font-bold">
                    {otherPerson.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm md:text-base leading-tight drop-shadow-md">{otherPerson.name}</h4>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  <span className="text-xs text-teal-300 font-semibold drop-shadow-md">
                    {isIncoming ? "Incoming Video Call" :
                     activeCall.status === 'connected' ? `Live Video • ${formatDuration(durationSeconds)}` :
                     activeCall.status === 'ringing' ? "Ringing..." : "Connecting..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Switch Camera Button (Front / Back) */}
            {activeCall.status === 'connected' && !isVideoOff && (
              <button
                onClick={handleSwitchCamera}
                disabled={isSwitchingCamera}
                className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md active:scale-95 text-white transition-all shadow-lg"
                title="Flip Camera"
              >
                <RefreshCw size={18} className={cn(isSwitchingCamera && "animate-spin")} />
              </button>
            )}
          </div>

          {/* Browser Permission Blocked Notice */}
          {isPermissionBlocked && (
            <div className="relative z-30 mx-4 my-2 px-3.5 py-2 rounded-2xl bg-amber-950/80 border border-amber-500/50 backdrop-blur-md flex items-center justify-between gap-3 text-amber-200 text-xs shadow-xl animate-in fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={16} className="text-amber-400 shrink-0" />
                <span className="text-[11px] font-medium leading-tight">
                  Camera/Mic blocked in browser. Running in preview mode.
                </span>
              </div>
              <button
                onClick={handleRetryHardwareMedia}
                disabled={isRetryingMedia}
                className="shrink-0 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[10px] active:scale-95 transition-all flex items-center gap-1 shadow-sm"
              >
                <RefreshCw size={11} className={cn(isRetryingMedia && "animate-spin")} />
                <span>Allow Live Feed</span>
              </button>
            </div>
          )}

          {/* Bottom Floating Control Bar */}
          <div className="relative z-10 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center gap-4 md:gap-6">
            {isIncoming ? (
              /* Incoming Call Buttons: Accept or Reject */
              <>
                <button
                  onClick={onRejectIncoming}
                  className="px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold flex items-center gap-2 shadow-xl shadow-rose-900/40 transition-transform"
                >
                  <PhoneOff size={20} />
                  <span>Decline</span>
                </button>
                <button
                  onClick={onAcceptIncoming}
                  className="px-8 py-3.5 rounded-full bg-teal-500 hover:bg-teal-400 active:scale-95 text-white font-bold flex items-center gap-2 shadow-xl shadow-teal-500/40 transition-transform animate-pulse"
                >
                  <Video size={20} />
                  <span>Accept Video</span>
                </button>
              </>
            ) : (
              /* Active Call Controls */
              <>
                {/* 1. Mute/Unmute Mic */}
                <button
                  onClick={handleToggleMute}
                  disabled={activeCall.status !== 'connected'}
                  className={cn(
                    "w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all shadow-lg",
                    isMuted 
                      ? "bg-rose-600 text-white shadow-rose-600/30" 
                      : "bg-white/20 hover:bg-white/30 text-white backdrop-blur-md"
                  )}
                  title={isMuted ? "Unmute Mic" : "Mute Mic"}
                >
                  {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>

                {/* 2. Turn Camera On/Off */}
                <button
                  onClick={handleToggleVideo}
                  disabled={activeCall.status !== 'connected'}
                  className={cn(
                    "w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all shadow-lg",
                    isVideoOff 
                      ? "bg-rose-600 text-white shadow-rose-600/30" 
                      : "bg-white/20 hover:bg-white/30 text-white backdrop-blur-md"
                  )}
                  title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                >
                  {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                </button>

                {/* 3. Switch Camera Flip Button */}
                <button
                  onClick={handleSwitchCamera}
                  disabled={activeCall.status !== 'connected' || isVideoOff || isSwitchingCamera}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-lg active:scale-95"
                  title="Flip Camera (Front/Back)"
                >
                  <RefreshCw size={20} className={cn(isSwitchingCamera && "animate-spin")} />
                </button>

                {/* 4. End Call Button */}
                <button
                  onClick={onEndCall}
                  className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition-transform"
                  title="End Call"
                >
                  <PhoneOff size={26} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. VOICE CALL UI VIEW (Audio Only)
  // ==========================================
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

        {/* Microphone Permission Notice */}
        {isPermissionBlocked && (
          <div className="relative z-20 w-full mb-3 px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
              <AlertCircle size={14} className="text-amber-400 shrink-0" />
              <span>Mic blocked. Preview mode active.</span>
            </div>
            <button
              onClick={handleRetryHardwareMedia}
              disabled={isRetryingMedia}
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-md text-[10px] active:scale-95 transition-all flex items-center gap-1 shrink-0"
            >
              <RefreshCw size={10} className={cn(isRetryingMedia && "animate-spin")} />
              <span>Allow Mic</span>
            </button>
          </div>
        )}

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
          <p className="text-xs text-emerald-400 font-bold mt-1 inline-flex items-center gap-1 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isValidPhone(otherPerson.phone) ? formatPhoneDisplay(otherPerson.phone) : (otherPerson.phone || 'Dukaan Pro Live Call')}
          </p>
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
