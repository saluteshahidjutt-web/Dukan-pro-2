import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { CallSession } from '../types';
import { generateId } from './utils';
import { FirestoreService } from './firestoreService';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ]
};

// Web Audio API Ringtone & Ringback synthesis
class CallAudioTone {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private interval: any = null;

  startRinging() {
    this.stop();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      
      const playBurst = () => {
        if (!this.ctx) return;
        try {
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(853, this.ctx.currentTime); // Standard ringtone chord
          osc2.frequency.setValueAtTime(960, this.ctx.currentTime);

          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.ctx.destination);

          osc1.start();
          osc2.start();
          osc1.stop(this.ctx.currentTime + 1.2);
          osc2.stop(this.ctx.currentTime + 1.2);
        } catch (e) {
          console.warn("Ringtone burst err", e);
        }
      };

      playBurst();
      this.interval = setInterval(playBurst, 2500);
    } catch (e) {
      console.warn("Audio Context err", e);
    }
  }

  startRingback() {
    this.stop();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const playBurst = () => {
        if (!this.ctx) return;
        try {
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(440, this.ctx.currentTime); // Standard dial ringback
          osc2.frequency.setValueAtTime(480, this.ctx.currentTime);

          gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 1.0);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.1);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.ctx.destination);

          osc1.start();
          osc2.start();
          osc1.stop(this.ctx.currentTime + 1.1);
          osc2.stop(this.ctx.currentTime + 1.1);
        } catch (e) {
          console.warn("Ringback burst err", e);
        }
      };

      playBurst();
      this.interval = setInterval(playBurst, 3000);
    } catch (e) {
      console.warn("Ringback ctx err", e);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}

export class WebRTCService {
  private static instance: WebRTCService;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private audioTone = new CallAudioTone();
  private unsubCallDoc: (() => void) | null = null;
  private unsubCandidates: (() => void) | null = null;
  private currentCallId: string | null = null;
  private currentCallType: 'voice' | 'video' = 'voice';
  private facingMode: 'user' | 'environment' = 'user';

  // Stream Callbacks for React Video elements
  private onLocalStreamCb: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteStreamCb: ((stream: MediaStream | null) => void) | null = null;

  // Call tracking & history logging
  private currentCaller: { uid: string; name: string; phone?: string; photoURL?: string } | null = null;
  private currentReceiver: { uid: string; name: string; phone?: string; photoURL?: string } | null = null;
  private currentCallStatus: CallSession['status'] | null = null;
  private connectedStartTime: number | null = null;
  private ringTimeoutTimer: any = null;
  private isCallLogged: boolean = false;

  private isFallbackMedia: boolean = false;
  private canvasAnimationTimer: any = null;
  private onPermissionBlockedCb: ((blocked: boolean) => void) | null = null;

  public static getInstance(): WebRTCService {
    if (!WebRTCService.instance) {
      WebRTCService.instance = new WebRTCService();
    }
    return WebRTCService.instance;
  }

  constructor() {
    // Create hidden remote audio element
    if (typeof document !== 'undefined') {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.id = 'remote-call-audio';
      document.body.appendChild(audio);
      this.remoteAudioElement = audio;
    }
  }

  public isPermissionBlocked(): boolean {
    return this.isFallbackMedia;
  }

  public setPermissionCallback(cb: ((blocked: boolean) => void) | null) {
    this.onPermissionBlockedCb = cb;
  }

  public setStreamCallbacks(
    onLocal: ((stream: MediaStream | null) => void) | null,
    onRemote: ((stream: MediaStream | null) => void) | null
  ) {
    this.onLocalStreamCb = onLocal;
    this.onRemoteStreamCb = onRemote;
    if (onLocal && this.localStream) onLocal(this.localStream);
    if (onRemote && this.remoteStream) onRemote(this.remoteStream);
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // 1. Listen for incoming calls on current user ID
  public subscribeToIncomingCalls(callback: (call: CallSession | null) => void): () => void {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return () => {};

    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', currentUid),
      where('status', '==', 'ringing')
    );

    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as CallSession;
        callback(data);
      }
    }, (err) => {
      console.warn("Incoming calls subscription warning:", err);
    });
  }

  // Synthetic Fallback MediaStream generator (Audio + Video Canvas)
  // Ensures calls NEVER fail with "Permission denied" in iframes or restricted environments
  private createFallbackMediaStream(callType: 'voice' | 'video'): MediaStream {
    this.isFallbackMedia = true;
    this.onPermissionBlockedCb?.(true);

    const stream = new MediaStream();

    // 1. Web Audio API synthesized silent audio track
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const dest = audioCtx.createMediaStreamDestination();
        gain.gain.value = 0.0001; // active minimal carrier
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      }
    } catch (e) {
      console.warn("Fallback Web Audio track creation error:", e);
    }

    // 2. Video fallback: dynamic animated canvas with caller profile
    if (callType === 'video') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          let step = 0;
          const callerName = this.currentCaller?.name || 'User';

          const drawFrame = () => {
            step++;
            const grad = ctx.createLinearGradient(0, 0, 640, 480);
            grad.addColorStop(0, '#090d16');
            grad.addColorStop(1, '#1e293b');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 640, 480);

            // Pulsing avatar circle
            const r = 55 + Math.sin(step * 0.1) * 5;
            ctx.beginPath();
            ctx.arc(320, 195, r, 0, Math.PI * 2);
            ctx.fillStyle = '#0d9488';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2dd4bf';
            ctx.stroke();

            // Avatar initial
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 48px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(callerName.charAt(0).toUpperCase() || 'U', 320, 195);

            // User name
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(callerName, 320, 285);

            // Subtitle
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = '#2dd4bf';
            ctx.fillText('Live Video Call (Preview Mode)', 320, 315);

            // Guidance note
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Allow camera/mic in browser URL bar to share live video', 320, 345);
          };

          drawFrame();
          if (this.canvasAnimationTimer) clearInterval(this.canvasAnimationTimer);
          this.canvasAnimationTimer = setInterval(drawFrame, 250);

          if ((canvas as any).captureStream) {
            const canvasStream = (canvas as any).captureStream(10);
            const videoTrack = canvasStream.getVideoTracks()[0];
            if (videoTrack) {
              stream.addTrack(videoTrack);
            }
          }
        }
      } catch (e) {
        console.warn("Fallback canvas video track creation error:", e);
      }
    }

    return stream;
  }

  // Helper to obtain user media with resilient fallback
  private async acquireMedia(callType: 'voice' | 'video'): Promise<MediaStream> {
    const isVideo = callType === 'video';
    this.isFallbackMedia = false;
    this.onPermissionBlockedCb?.(false);

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        if (isVideo) {
          try {
            return await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: {
                facingMode: this.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            });
          } catch (e1) {
            console.warn("Video with ideal constraints failed, fallback to basic video", e1);
            try {
              return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            } catch (e2) {
              console.warn("Camera permission not available, fallback to audio only", e2);
              return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
          }
        } else {
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
      } catch (err: any) {
        console.warn("Hardware media access not permitted or denied by browser:", err?.message || err);
      }
    } else {
      console.warn("navigator.mediaDevices.getUserMedia is not supported or restricted in this environment.");
    }

    // Graceful fallback stream so call always proceeds smoothly
    return this.createFallbackMediaStream(callType);
  }

  // Attempt to upgrade fallback stream to live hardware mic/camera during call
  public async retryHardwareMedia(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const isVideo = this.currentCallType === 'video';
      const realStream = isVideo 
        ? await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        
        // Replace audio track
        const newAudioTrack = realStream.getAudioTracks()[0];
        if (newAudioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
          }
        }

        // Replace video track if video call
        if (isVideo) {
          const newVideoTrack = realStream.getVideoTracks()[0];
          if (newVideoTrack) {
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(newVideoTrack);
            }
          }
        }
      }

      // Stop old tracks and update local stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
      }
      if (this.canvasAnimationTimer) {
        clearInterval(this.canvasAnimationTimer);
        this.canvasAnimationTimer = null;
      }

      this.localStream = realStream;
      this.isFallbackMedia = false;
      this.onPermissionBlockedCb?.(false);
      this.onLocalStreamCb?.(realStream);
      return true;
    } catch (e) {
      console.warn("Retry hardware media failed:", e);
      return false;
    }
  }

  // 2. Start an Outgoing Call (Voice or Video)
  public async startCall(
    receiver: { uid: string; name: string; phone: string; photoURL?: string },
    caller: { uid: string; name: string; phone: string; photoURL?: string },
    onStatusChange: (status: CallSession['status']) => void,
    callType: 'voice' | 'video' = 'voice'
  ): Promise<string> {
    this.cleanup();

    const callId = `call_${generateId()}`;
    this.currentCallId = callId;
    this.currentCallType = callType;
    this.currentCaller = caller;
    this.currentReceiver = receiver;
    this.currentCallStatus = 'ringing';
    this.connectedStartTime = null;
    this.isCallLogged = false;

    const callDocRef = doc(db, 'calls', callId);

    // Get Media Stream (Audio or Audio+Video)
    const stream = await this.acquireMedia(callType);
    this.localStream = stream;
    this.onLocalStreamCb?.(stream);

    // Create RTCPeerConnection
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnection = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Remote track handler (Audio & Video)
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.remoteAudioElement) {
          this.remoteAudioElement.srcObject = event.streams[0];
          this.remoteAudioElement.play().catch(e => console.warn("Remote audio play err", e));
        }
        this.onRemoteStreamCb?.(event.streams[0]);
      }
    };

    // Collect ICE Candidates to send to receiver
    const callerCandidatesCollection = collection(db, 'calls', callId, 'callerCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(callerCandidatesCollection, event.candidate.toJSON()).catch(e => console.warn("Candidate add err", e));
      }
    };

    // Create SDP Offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const callData: CallSession = {
      id: callId,
      callerId: caller.uid,
      callerName: caller.name,
      callerPhone: caller.phone,
      callerPhoto: caller.photoURL || '',
      receiverId: receiver.uid,
      receiverName: receiver.name,
      receiverPhone: receiver.phone,
      receiverPhoto: receiver.photoURL || '',
      callType: callType,
      status: 'ringing',
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp
      },
      createdAt: new Date().toISOString()
    };

    await setDoc(callDocRef, callData);
    this.audioTone.startRingback();

    // 35-Second Ring Timeout (If receiver is offline or doesn't answer -> Missed Call)
    this.ringTimeoutTimer = setTimeout(async () => {
      if (this.currentCallStatus === 'ringing' && this.currentCallId === callId) {
        console.log("Call timed out: Recipient offline or didn't answer.");
        await this.endCall(callId, 'missed');
        onStatusChange('ended');
      }
    }, 35000);

    // Listen for Answer and Call Status
    this.unsubCallDoc = onSnapshot(callDocRef, async (snapshot) => {
      const data = snapshot.data() as CallSession | undefined;
      if (!data) return;

      this.currentCallStatus = data.status;
      onStatusChange(data.status);

      if (data.status === 'ringing') {
        // Still ringing
      } else if (data.status === 'connected' && !pc.currentRemoteDescription && data.answer) {
        if (this.ringTimeoutTimer) {
          clearTimeout(this.ringTimeoutTimer);
          this.ringTimeoutTimer = null;
        }
        this.connectedStartTime = Date.now();
        this.audioTone.stop();
        const answerDescription = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answerDescription);
      } else if (data.status === 'ended' || data.status === 'rejected' || data.status === 'busy') {
        if (this.ringTimeoutTimer) {
          clearTimeout(this.ringTimeoutTimer);
          this.ringTimeoutTimer = null;
        }
        this.audioTone.stop();
        this.logCallRecord(data.status);
        this.cleanup();
      }
    });

    // Listen for Receiver ICE Candidates
    const receiverCandidatesCollection = collection(db, 'calls', callId, 'receiverCandidates');
    this.unsubCandidates = onSnapshot(receiverCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (e) {
            console.warn("Error adding receiver ice candidate", e);
          }
        }
      });
    });

    return callId;
  }

  // 3. Answer Incoming Call
  public async answerCall(
    callSession: CallSession,
    onStatusChange: (status: CallSession['status']) => void
  ) {
    this.cleanup();
    this.currentCallId = callSession.id;
    this.currentCallType = callSession.callType || 'voice';
    this.currentCaller = {
      uid: callSession.callerId,
      name: callSession.callerName,
      phone: callSession.callerPhone,
      photoURL: callSession.callerPhoto
    };
    this.currentReceiver = {
      uid: callSession.receiverId,
      name: callSession.receiverName,
      phone: callSession.receiverPhone,
      photoURL: callSession.receiverPhoto
    };
    this.currentCallStatus = 'connected';
    this.connectedStartTime = Date.now();
    this.isCallLogged = false;

    this.audioTone.stop();

    const callDocRef = doc(db, 'calls', callSession.id);

    // Get Local Stream (matches callType: voice or video)
    const stream = await this.acquireMedia(this.currentCallType);
    this.localStream = stream;
    this.onLocalStreamCb?.(stream);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnection = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.remoteAudioElement) {
          this.remoteAudioElement.srcObject = event.streams[0];
          this.remoteAudioElement.play().catch(e => console.warn("Remote audio play err", e));
        }
        this.onRemoteStreamCb?.(event.streams[0]);
      }
    };

    // Collect Receiver ICE Candidates
    const receiverCandidatesCollection = collection(db, 'calls', callSession.id, 'receiverCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(receiverCandidatesCollection, event.candidate.toJSON()).catch(e => console.warn("Receiver candidate err", e));
      }
    };

    // Set Remote Offer Description
    const offerDescription = callSession.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Create SDP Answer
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    await updateDoc(callDocRef, {
      status: 'connected',
      answer: {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      }
    });

    onStatusChange('connected');

    // Listen for Caller ICE Candidates
    const callerCandidatesCollection = collection(db, 'calls', callSession.id, 'callerCandidates');
    this.unsubCandidates = onSnapshot(callerCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (e) {
            console.warn("Error adding caller ice candidate", e);
          }
        }
      });
    });

    // Listen for call termination
    this.unsubCallDoc = onSnapshot(callDocRef, (snapshot) => {
      const data = snapshot.data() as CallSession | undefined;
      if (!data) return;
      this.currentCallStatus = data.status;
      onStatusChange(data.status);
      if (data.status === 'ended' || data.status === 'rejected') {
        this.logCallRecord(data.status);
        this.cleanup();
      }
    });
  }

  // 4. Reject Incoming Call
  public async rejectCall(callId: string, caller?: any, receiver?: any) {
    this.audioTone.stop();
    if (caller) this.currentCaller = caller;
    if (receiver) this.currentReceiver = receiver;

    try {
      const callDocRef = doc(db, 'calls', callId);
      await updateDoc(callDocRef, {
        status: 'rejected',
        endedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Reject call err", e);
    }
    this.logCallRecord('rejected');
    this.cleanup();
  }

  // 5. End Active Call
  public async endCall(callId?: string, overrideStatus?: 'missed' | 'rejected' | 'ended') {
    if (this.ringTimeoutTimer) {
      clearTimeout(this.ringTimeoutTimer);
      this.ringTimeoutTimer = null;
    }
    this.audioTone.stop();
    const id = callId || this.currentCallId;

    const finalStatus = overrideStatus || (this.connectedStartTime ? 'ended' : 'missed');

    if (id) {
      try {
        const callDocRef = doc(db, 'calls', id);
        await updateDoc(callDocRef, {
          status: finalStatus === 'missed' ? 'ended' : finalStatus,
          endedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn("End call err", e);
      }
    }

    this.logCallRecord(finalStatus === 'missed' ? 'missed' : 'ended');
    this.cleanup();
  }

  // Write call history record into chat room
  private logCallRecord(status: string) {
    if (this.isCallLogged) return;
    if (!this.currentCaller || !this.currentReceiver) return;

    this.isCallLogged = true;

    const caller = this.currentCaller;
    const receiver = this.currentReceiver;
    const callId = this.currentCallId || undefined;
    const callType = this.currentCallType || 'voice';

    let finalLogStatus: 'missed' | 'completed' | 'rejected' | 'busy' = 'missed';
    let duration = 0;

    if (this.connectedStartTime) {
      duration = Math.max(1, Math.round((Date.now() - this.connectedStartTime) / 1000));
      finalLogStatus = 'completed';
    } else if (status === 'rejected') {
      finalLogStatus = 'rejected';
    } else if (status === 'busy') {
      finalLogStatus = 'busy';
    } else {
      finalLogStatus = 'missed';
    }

    FirestoreService.sendCallLogMessage(caller, receiver, finalLogStatus, duration, callId, callType).catch(e => {
      console.warn("Call log message recording warning:", e);
    });
  }

  // Toggle Microphone Mute
  public toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  // Toggle Camera / Video on/off
  public toggleVideo(enabled: boolean): boolean {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      return enabled;
    }
    return false;
  }

  // Switch between Front & Rear Camera on Mobile Devices
  public async switchCamera(): Promise<boolean> {
    if (!this.peerConnection || !this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    const newFacingMode = this.facingMode === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return false;

      // Replace track on RTCPeerConnection sender
      const senders = this.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }

      // Stop old video track
      videoTrack.stop();
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(newVideoTrack);

      this.facingMode = newFacingMode;
      this.onLocalStreamCb?.(this.localStream);
      return true;
    } catch (e) {
      console.warn("Switch camera error:", e);
      return false;
    }
  }

  public playIncomingRingtone() {
    this.audioTone.startRinging();
  }

  public stopRingtone() {
    this.audioTone.stop();
  }

  // Clean up all resources
  public cleanup() {
    if (this.ringTimeoutTimer) {
      clearTimeout(this.ringTimeoutTimer);
      this.ringTimeoutTimer = null;
    }
    this.audioTone.stop();

    if (this.unsubCallDoc) {
      this.unsubCallDoc();
      this.unsubCallDoc = null;
    }
    if (this.unsubCandidates) {
      this.unsubCandidates();
      this.unsubCandidates = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.onLocalStreamCb?.(null);
    this.onRemoteStreamCb?.(null);

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    if (this.canvasAnimationTimer) {
      clearInterval(this.canvasAnimationTimer);
      this.canvasAnimationTimer = null;
    }
    this.isFallbackMedia = false;
    this.onPermissionBlockedCb?.(false);

    this.currentCallId = null;
    this.connectedStartTime = null;
  }
}

export const webrtcService = WebRTCService.getInstance();
