import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Send, 
  Mic, 
  Play, 
  Pause, 
  MessageSquare, 
  ArrowLeft, 
  Phone, 
  PhoneCall,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Trash2,
  Image as ImageIcon,
  X,
  Lock,
  Loader2,
  Archive,
  ArchiveRestore
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { FirestoreService } from '../lib/firestoreService';
import { ChatRoom, ChatMessage, UserProfile, ShopSettings } from '../types';
import { cn } from '../lib/utils';

interface ChatHubProps {
  settings: ShopSettings;
  onClose?: () => void;
  initialChatUserId?: string;
  initialChatUserPhone?: string;
  initialChatUserName?: string;
  onStartVoiceCall?: (targetUser: { uid: string; name: string; phone: string; photoURL?: string }) => void;
}

export function ChatHub({ 
  settings, 
  onClose,
  initialChatUserId,
  initialChatUserPhone,
  initialChatUserName,
  onStartVoiceCall
}: ChatHubProps) {
  const currentUid = auth.currentUser?.uid;
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showArchivedView, setShowArchivedView] = useState(false);
  const [swipedRoomId, setSwipedRoomId] = useState<string | null>(null);

  // Touch Swipe Gesture State
  const touchStartRef = useRef<number | null>(null);

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio Playback State
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Image Upload & Preview Modal
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  // Auto-scroll anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Sync current user identity to public searchable directory
  useEffect(() => {
    if (auth.currentUser) {
      const userPhoto = settings.logoUrl || settings.photoURL || auth.currentUser.photoURL || '';
      FirestoreService.syncUserProfile({
        name: settings.name || auth.currentUser.displayName || 'Dukaan User',
        phone: settings.phone || '',
        photoURL: userPhoto
      });
    }
  }, [settings.name, settings.phone, settings.logoUrl, settings.photoURL]);

  // 2. Subscribe to active chat rooms (Real-time synchronization across all logged-in devices/mobiles/PC)
  useEffect(() => {
    if (!currentUid) return;
    const unsubscribe = FirestoreService.subscribeToChatRooms((rooms) => {
      setChatRooms(rooms);
      // Keep active room in sync if another device sent a message
      if (activeRoom) {
        const matching = rooms.find(r => r.id === activeRoom.id);
        if (matching) {
          setActiveRoom(prev => ({ ...prev, ...matching }));
        }
      }
    });
    return () => unsubscribe();
  }, [currentUid, activeRoom?.id]);

  // 3. Handle Direct Incoming chat request (e.g. from customer profile)
  useEffect(() => {
    if (initialChatUserId || initialChatUserPhone) {
      const targetUser: UserProfile = {
        id: initialChatUserId || `user_${initialChatUserPhone}`,
        uid: initialChatUserId || `user_${initialChatUserPhone}`,
        name: initialChatUserName || 'User',
        phone: initialChatUserPhone || '',
        updatedAt: new Date().toISOString()
      };
      startChatWithUser(targetUser);
    }
  }, [initialChatUserId, initialChatUserPhone]);

  // 4. Subscribe to messages in 100% REAL-TIME for active room
  useEffect(() => {
    if (!activeRoom) {
      setMessages([]);
      return;
    }
    const unsubscribe = FirestoreService.subscribeToMessages(activeRoom.id, (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
    return () => unsubscribe();
  }, [activeRoom?.id]);

  // Handle Search strictly by phone
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await FirestoreService.searchUserByPhone(searchQuery);
        setSearchResults(results);
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filtered Chats (Active vs Archived vs Deleted)
  const activeChats = chatRooms.filter(room => {
    const isArchived = currentUid ? room.archivedBy?.includes(currentUid) : false;
    const isDeleted = currentUid ? room.deletedFor?.includes(currentUid) : false;
    return !isArchived && !isDeleted;
  });

  const archivedChats = chatRooms.filter(room => {
    const isArchived = currentUid ? room.archivedBy?.includes(currentUid) : false;
    const isDeleted = currentUid ? room.deletedFor?.includes(currentUid) : false;
    return isArchived && !isDeleted;
  });

  const displayedChats = showArchivedView ? archivedChats : activeChats;

  // Open / Start Chat with selected User
  const startChatWithUser = async (targetUser: UserProfile) => {
    const myUid = auth.currentUser?.uid || 'user';
    const participants = [myUid, targetUser.uid].sort();
    const p0 = myUid.replace(/[^a-zA-Z0-9]/g, '_');
    const p1 = targetUser.uid.replace(/[^a-zA-Z0-9]/g, '_');
    const sortedClean = [p0, p1].sort();
    const roomId = `room_${sortedClean[0]}_${sortedClean[1]}`;
    const myPhoto = settings.logoUrl || settings.photoURL || auth.currentUser?.photoURL || '';

    const immediateRoom: ChatRoom = {
      id: roomId,
      participants,
      participantDetails: {
        [myUid]: { 
          name: settings.name || auth.currentUser?.displayName || 'User', 
          phone: settings.phone || '', 
          photoURL: myPhoto 
        },
        [targetUser.uid]: { 
          name: targetUser.name, 
          phone: targetUser.phone, 
          photoURL: targetUser.photoURL || '' 
        }
      },
      updatedAt: new Date().toISOString()
    };

    setActiveRoom(immediateRoom);
    setSearchQuery('');
    setSearchResults([]);

    try {
      const room = await FirestoreService.getOrCreateChatRoom(targetUser, {
        name: settings.name || auth.currentUser?.displayName || 'User',
        phone: settings.phone || '',
        photoURL: myPhoto
      });
      setActiveRoom(room);
    } catch (e) {
      console.warn("Room fallback:", e);
    }
  };

  // Toggle Archive Chat
  const handleToggleArchive = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    const room = chatRooms.find(r => r.id === roomId);
    if (!room || !currentUid) return;
    const isArchived = room.archivedBy?.includes(currentUid) || false;
    await FirestoreService.toggleArchiveChatRoom(roomId, isArchived);
    setSwipedRoomId(null);
  };

  // Delete Chat
  const handleDeleteChat = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (confirm("Kya aap yeh chat delete karna chahte hain?")) {
      await FirestoreService.deleteChatRoomForUser(roomId);
      if (activeRoom?.id === roomId) {
        setActiveRoom(null);
      }
      setSwipedRoomId(null);
    }
  };

  // Send Text Message
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !activeRoom) return;

    const text = textInput.trim();
    setTextInput('');

    try {
      await FirestoreService.sendMessage(activeRoom.id, {
        type: 'text',
        text
      });
    } catch (error) {
      console.error("Send text failed:", error);
    }
  };

  // --- Voice Message Recording (MediaRecorder API) ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access error:", err);
      alert("Microphone permission zaroori hai voice message ke liye. Browser mein Mic allow karein.");
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !activeRoom) return;

    clearInterval(recordingTimerRef.current);
    const duration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        try {
          await FirestoreService.sendMessage(activeRoom.id, {
            type: 'voice',
            audioData: base64Audio,
            audioDuration: duration
          });
        } catch (err) {
          console.error("Voice send failed:", err);
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.stop();
  };

  // Play / Pause Voice Note
  const togglePlayAudio = (msg: ChatMessage) => {
    if (!msg.audioData) return;

    if (playingMsgId === msg.id && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingMsgId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(msg.audioData);
    audioPlayerRef.current = audio;
    setPlayingMsgId(msg.id);

    audio.onended = () => {
      setPlayingMsgId(null);
    };

    audio.play().catch(e => {
      console.error("Audio playback failed:", e);
      setPlayingMsgId(null);
    });
  };

  // Send Image Message
  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeRoom) return;

    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

          await FirestoreService.sendMessage(activeRoom.id, {
            type: 'image',
            imageData: compressedDataUrl
          });
          setIsUploadingImage(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Image upload failed:", err);
      setIsUploadingImage(false);
    }
  };

  const getOtherParticipant = (room: ChatRoom) => {
    const otherUid = room.participants.find(p => p !== currentUid) || '';
    return room.participantDetails?.[otherUid] || {
      name: 'User',
      phone: otherUid,
      photoURL: ''
    };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-95px)] md:h-[calc(100vh-120px)] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex h-full w-full relative">
        {/* Left / Main Sidebar: Chats list, Archive and Search */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 h-full",
          activeRoom ? "hidden md:flex" : "flex"
        )}>
          {/* Header with Archive section in Top Left */}
          <div className={cn(
            "p-3.5 text-white flex items-center justify-between shadow-md transition-colors",
            showArchivedView ? "bg-slate-800" : "bg-emerald-700"
          )}>
            <div className="flex items-center gap-2">
              {showArchivedView ? (
                <>
                  <button 
                    onClick={() => setShowArchivedView(false)}
                    className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white transition-colors"
                    title="Back to All Chats"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-1.5">
                    <Archive size={18} className="text-emerald-400" />
                    Archived Chats ({archivedChats.length})
                  </h2>
                </>
              ) : (
                <>
                  {/* Top Left Archive Button */}
                  <button
                    onClick={() => setShowArchivedView(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 active:scale-95 rounded-xl text-xs font-bold text-emerald-100 transition-all shadow-sm"
                    title="Archived Chats"
                  >
                    <Archive size={14} className="text-emerald-300" />
                    <span>Archived</span>
                    {archivedChats.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 bg-emerald-400 text-emerald-950 rounded-full text-[10px] font-black">
                        {archivedChats.length}
                      </span>
                    )}
                  </button>

                  <h2 className="text-base font-black tracking-tight flex items-center gap-1.5 ml-1">
                    <MessageSquare size={18} className="text-emerald-300" />
                    Chats
                  </h2>
                </>
              )}
            </div>

            {onClose && (
              <button 
                onClick={onClose} 
                className="p-2 bg-emerald-800 hover:bg-emerald-900 rounded-xl text-white transition-colors"
                title="Wapis"
              >
                <ArrowLeft size={18} />
              </button>
            )}
          </div>

          {/* Search Bar: Only explicit phone search (Privacy Protected) */}
          {!showArchivedView && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <input
                  type="tel"
                  placeholder="Mobile number likhein (e.g. 0321...)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-slate-700 text-xs font-bold rounded-2xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                />
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search Results Display */}
          {searchQuery.trim().length >= 2 && !showArchivedView && (
            <div className="bg-emerald-50/90 dark:bg-slate-700/80 p-2.5 border-b border-emerald-100 dark:border-slate-600 shadow-inner">
              <p className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider px-1 py-1">
                🔍 Search Result:
              </p>
              {isSearching ? (
                <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 font-bold">
                  <Loader2 size={16} className="animate-spin" /> Number dhoond rahe hain...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-1 font-black text-xs">
                    ✕
                  </div>
                  <p className="text-xs font-black text-rose-600 dark:text-rose-400">
                    User not available
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    Yeh number "{searchQuery}" Dukaan app par registered nahi hai.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {searchResults.map((u) => (
                    <div
                      key={u.uid}
                      onClick={() => startChatWithUser(u)}
                      className="cursor-pointer w-full flex items-center justify-between p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-all text-left shadow-sm active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.name} className="w-10 h-10 rounded-2xl object-cover shadow border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-xs shadow">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-black text-slate-800 dark:text-white">{u.name}</p>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{u.phone}</p>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startChatWithUser(u);
                        }}
                        className="text-xs bg-emerald-600 text-white font-black px-3 py-1.5 rounded-xl hover:bg-emerald-700 shadow"
                      >
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chats List (Swipe left to reveal Delete & Archive) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {displayedChats.length === 0 && !searchQuery ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-slate-400 h-full">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-slate-700 flex items-center justify-center text-emerald-600 mb-3 shadow-inner">
                  {showArchivedView ? <Archive size={24} /> : <Phone size={24} />}
                </div>
                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200">
                  {showArchivedView ? 'Koi archived chat nahi hai' : 'Abhi koi chat nahi hai'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  {showArchivedView 
                    ? 'Kisi bhi chat ko swipe left kar ke yahan archive kar saktay hain.' 
                    : 'Kisi se baat karne ke liye upar search bar main unka Mobile Number likhein.'}
                </p>
                {!showArchivedView && (
                  <div className="mt-4 px-3 py-2 bg-slate-50 dark:bg-slate-700/40 rounded-xl text-[10px] text-slate-500 font-medium">
                    👉 Tip: Chat ko swipe left karein Archive ya Delete karne ke liye.
                  </div>
                )}
              </div>
            ) : (
              displayedChats.map((room) => {
                const other = getOtherParticipant(room);
                const isSelected = activeRoom?.id === room.id;
                const isSwiped = swipedRoomId === room.id;
                const isArchived = currentUid ? room.archivedBy?.includes(currentUid) : false;

                return (
                  <div 
                    key={room.id}
                    className="relative overflow-hidden group select-none bg-white dark:bg-slate-800"
                    onTouchStart={(e) => {
                      touchStartRef.current = e.touches[0].clientX;
                    }}
                    onTouchMove={(e) => {
                      if (touchStartRef.current === null) return;
                      const diffX = touchStartRef.current - e.touches[0].clientX;
                      if (diffX > 45) {
                        setSwipedRoomId(room.id);
                      } else if (diffX < -45) {
                        setSwipedRoomId(null);
                      }
                    }}
                  >
                    {/* Underlying Action Buttons (Revealed on Swipe) */}
                    <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
                      <button
                        onClick={(e) => handleToggleArchive(e, room.id)}
                        className="px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                        title={isArchived ? "Unarchive" : "Archive"}
                      >
                        {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                        <span className="text-[9px]">{isArchived ? "Unarchive" : "Archive"}</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(e, room.id)}
                        className="px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                        title="Delete Chat"
                      >
                        <Trash2 size={18} />
                        <span className="text-[9px]">Delete</span>
                      </button>
                    </div>

                    {/* Chat Card Foreground */}
                    <div
                      onClick={() => {
                        if (isSwiped) {
                          setSwipedRoomId(null);
                        } else {
                          setActiveRoom(room);
                        }
                      }}
                      className={cn(
                        "relative z-10 w-full p-3.5 flex items-center gap-3 text-left transition-transform duration-200 ease-out bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50",
                        isSwiped ? "-translate-x-32" : "translate-x-0",
                        isSelected && "bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-600"
                      )}
                    >
                      {other.photoURL ? (
                        <img src={other.photoURL} alt={other.name} className="w-11 h-11 rounded-2xl object-cover shadow border border-slate-200 dark:border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black flex items-center justify-center shadow text-sm shrink-0">
                          {other.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                            {other.name}
                          </p>
                          <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">
                            {new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5 font-medium flex items-center gap-1">
                          {room.lastMessageType === 'voice' && <Mic size={12} className="text-emerald-500 inline shrink-0" />}
                          {room.lastMessageType === 'image' && <ImageIcon size={12} className="text-emerald-500 inline shrink-0" />}
                          {room.lastMessageType === 'call' && (
                            room.lastMessageCallStatus === 'missed' ? (
                              <span className="text-rose-500 dark:text-rose-400 font-bold flex items-center gap-1">
                                <PhoneMissed size={12} className="shrink-0" /> Missed call
                              </span>
                            ) : room.lastMessageCallStatus === 'rejected' ? (
                              <span className="text-amber-500 font-bold flex items-center gap-1">
                                <PhoneMissed size={12} className="shrink-0" /> Declined call
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <PhoneIncoming size={12} className="shrink-0" /> {room.lastMessageText || 'Voice call'}
                              </span>
                            )
                          )}
                          {room.lastMessageType !== 'call' && (
                            <span className="truncate">{room.lastMessageText || 'Tap to chat'}</span>
                          )}
                        </div>
                      </div>

                      {/* Desktop Quick Hover Actions */}
                      <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-1">
                        <button
                          onClick={(e) => handleToggleArchive(e, room.id)}
                          className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-600 rounded-lg transition-colors"
                          title={isArchived ? "Unarchive" : "Archive"}
                        >
                          {isArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        </button>
                        <button
                          onClick={(e) => handleDeleteChat(e, room.id)}
                          className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 rounded-lg transition-colors"
                          title="Delete Chat"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right / Chat Conversation Room */}
        <div className={cn(
          "flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 h-full",
          !activeRoom ? "hidden md:flex items-center justify-center" : "flex"
        )}>
          {!activeRoom ? (
            <div className="text-center p-8 text-slate-400">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-4 shadow-inner">
                <MessageSquare size={36} />
              </div>
              <h3 className="text-lg font-black text-slate-700 dark:text-slate-200">Chat Shuru Karein</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Left side par search bar mein kisi ka mobile number likhein aur direct realtime messages, photos ya voice notes bhejein.
              </p>
            </div>
          ) : (
            <>
              {/* Active Room Top Bar */}
              <div className="p-3.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setActiveRoom(null)} 
                    className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                    title="Back to list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  {getOtherParticipant(activeRoom).photoURL ? (
                    <img src={getOtherParticipant(activeRoom).photoURL} alt={getOtherParticipant(activeRoom).name} className="w-10 h-10 rounded-2xl object-cover shadow border border-slate-200 dark:border-slate-700 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center shadow text-sm shrink-0">
                      {getOtherParticipant(activeRoom).name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      {getOtherParticipant(activeRoom).name}
                    </h3>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {getOtherParticipant(activeRoom).phone || 'Direct Chat'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Live WebRTC Internet Voice Call (Works on Website & PC & Mobile) */}
                  <button
                    onClick={() => {
                      const other = getOtherParticipant(activeRoom);
                      const otherUid = activeRoom.participants.find(p => p !== currentUid) || '';
                      onStartVoiceCall?.({
                        uid: otherUid,
                        name: other.name,
                        phone: other.phone || '',
                        photoURL: other.photoURL
                      });
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-sm text-xs font-bold"
                    title="Live Web Voice Call (Website par direct baat karein)"
                  >
                    <PhoneCall size={15} />
                    <span className="hidden sm:inline">Live Call</span>
                  </button>

                  {getOtherParticipant(activeRoom).phone && (
                    <a 
                      href={`tel:${getOtherParticipant(activeRoom).phone}`}
                      className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      title="SIM / Phone Dialer Call"
                    >
                      <Phone size={15} />
                    </a>
                  )}
                  <button
                    onClick={(e) => handleToggleArchive(e, activeRoom.id)}
                    className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-amber-50 hover:text-amber-600 transition-colors"
                    title={activeRoom.archivedBy?.includes(currentUid || '') ? "Unarchive" : "Archive"}
                  >
                    {activeRoom.archivedBy?.includes(currentUid || '') ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <button
                    onClick={(e) => handleDeleteChat(e, activeRoom.id)}
                    className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
                    title="Delete Chat"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Messages Body (Instant Realtime Sync across Mobiles & PC) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="text-[11px] bg-slate-200/70 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 px-3.5 py-1.5 rounded-full font-medium shadow-sm inline-flex items-center gap-1.5">
                      <Lock size={12} className="text-emerald-600" /> Direct realtime encrypted chat
                    </span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === currentUid;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[85%] md:max-w-[70%]",
                          isMe ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "p-3 rounded-2xl text-xs md:text-sm shadow-md transition-all",
                            isMe 
                              ? "bg-emerald-600 text-white rounded-br-none" 
                              : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-700"
                          )}
                        >
                          {/* 1. Image Message Bubble */}
                          {msg.type === 'image' && msg.imageData && (
                            <div className="mb-1 rounded-xl overflow-hidden cursor-pointer" onClick={() => setSelectedPreviewImage(msg.imageData || null)}>
                              <img 
                                src={msg.imageData} 
                                alt="Shared photo" 
                                className="max-h-60 w-auto rounded-xl object-cover hover:opacity-95 transition-opacity shadow-sm" 
                              />
                            </div>
                          )}

                          {/* 2. Voice Note Player Bubble */}
                          {msg.type === 'voice' && (
                            <div className="flex items-center gap-3 min-w-[190px] md:min-w-[220px] py-1">
                              <button
                                onClick={() => togglePlayAudio(msg)}
                                className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center transition-all shadow shrink-0",
                                  isMe ? "bg-white text-emerald-700" : "bg-emerald-600 text-white"
                                )}
                              >
                                {playingMsgId === msg.id ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                              </button>
                              <div className="flex-1">
                                <div className="flex items-center justify-between text-[10px] font-bold opacity-80 mb-1">
                                  <span>🎙️ Voice Note</span>
                                  <span>{msg.audioDuration ? `${msg.audioDuration}s` : 'Audio'}</span>
                                </div>
                                <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-300",
                                      playingMsgId === msg.id ? "w-full animate-pulse bg-emerald-300" : "w-1/3 bg-emerald-400"
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 3. Call Event / Missed Call Bubble */}
                          {msg.type === 'call' && (
                            <div className="min-w-[200px] md:min-w-[240px] py-1">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                  msg.callInfo?.status === 'missed' 
                                    ? (isMe ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400" : "bg-rose-500 text-white animate-pulse")
                                    : msg.callInfo?.status === 'rejected'
                                    ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                                )}>
                                  {msg.callInfo?.status === 'missed' ? (
                                    <PhoneMissed size={20} />
                                  ) : msg.callInfo?.status === 'rejected' ? (
                                    <PhoneMissed size={20} />
                                  ) : (
                                    <PhoneIncoming size={20} />
                                  )}
                                </div>

                                <div className="flex-1">
                                  <h4 className={cn(
                                    "text-xs font-black leading-tight",
                                    msg.callInfo?.status === 'missed'
                                      ? (isMe ? (isMe ? "text-white" : "text-rose-600 dark:text-rose-400") : (isMe ? "text-white" : "text-rose-600 dark:text-rose-400 font-black"))
                                      : (isMe ? "text-white" : "text-slate-900 dark:text-white")
                                  )}>
                                    {msg.callInfo?.status === 'missed' 
                                      ? (isMe ? 'Outgoing call (No answer)' : 'Missed voice call')
                                      : msg.callInfo?.status === 'rejected'
                                      ? 'Call declined'
                                      : 'Voice call'}
                                  </h4>
                                  <p className={cn(
                                    "text-[10px] font-semibold mt-0.5",
                                    isMe ? "text-emerald-100" : "text-slate-500 dark:text-slate-400"
                                  )}>
                                    {msg.callInfo?.status === 'completed' && msg.callInfo?.duration !== undefined
                                      ? (msg.callInfo.duration > 59 
                                          ? `${Math.floor(msg.callInfo.duration / 60)}m ${msg.callInfo.duration % 60}s`
                                          : `${msg.callInfo.duration}s`)
                                      : (msg.callInfo?.status === 'missed' && !isMe ? 'Tap Call Back to return call' : 'Internet call')}
                                  </p>
                                </div>
                              </div>

                              {/* Call Back Button */}
                              {activeRoom && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const other = getOtherParticipant(activeRoom);
                                    const otherUid = activeRoom.participants.find(p => p !== currentUid) || '';
                                    onStartVoiceCall?.({
                                      uid: otherUid,
                                      name: other.name,
                                      phone: other.phone || '',
                                      photoURL: other.photoURL
                                    });
                                  }}
                                  className={cn(
                                    "w-full mt-2.5 py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95",
                                    isMe 
                                      ? "bg-white/20 hover:bg-white/30 text-white border border-white/20"
                                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  )}
                                >
                                  <PhoneCall size={13} />
                                  <span>{msg.callInfo?.status === 'missed' && !isMe ? 'Call Back' : 'Call Again'}</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* 4. Text Message Bubble */}
                          {msg.type === 'text' && msg.text && (
                            <p className="whitespace-pre-wrap break-words font-medium">{msg.text}</p>
                          )}
                          
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1 text-[9px] opacity-75 font-bold",
                            isMe ? "text-emerald-100" : "text-slate-400"
                          )}>
                            <span>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMe && <span>✓✓</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input Area */}
              <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                {isRecording ? (
                  /* Live Recording View */
                  <div className="flex items-center justify-between bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-2xl border border-rose-200 dark:border-rose-900 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                      <span className="text-xs font-black text-rose-700 dark:text-rose-300">
                        Recording Voice: {recordingDuration}s
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={cancelRecording}
                        className="p-2 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1"
                        title="Cancel"
                      >
                        <Trash2 size={16} />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                      <button
                        onClick={stopAndSendRecording}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-emerald-700 flex items-center gap-1 shadow"
                      >
                        <Send size={14} />
                        <span>Send Note</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Input View: Image, Text & Voice */
                  <form onSubmit={handleSendText} className="flex items-center gap-2">
                    {/* Hidden file input for compressed image */}
                    <input 
                      type="file" 
                      accept="image/*" 
                      ref={fileInputRef} 
                      onChange={handleImageSelected} 
                      className="hidden" 
                    />

                    {/* Camera / Photo Button */}
                    <button
                      type="button"
                      disabled={isUploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 transition-colors shrink-0"
                      title="Photo / Image Bhejein (Compressed)"
                    >
                      {isUploadingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                    </button>

                    <input
                      type="text"
                      placeholder="Message likhein..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-3 rounded-2xl text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-200 dark:border-slate-600"
                    />

                    {textInput.trim() ? (
                      <button
                        type="submit"
                        className="bg-emerald-600 text-white p-3 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-200 dark:shadow-none shrink-0"
                      >
                        <Send size={18} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="bg-emerald-600 text-white p-3 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-200 dark:shadow-none flex items-center gap-1 shrink-0"
                        title="Mic se Voice Record karein"
                      >
                        <Mic size={18} />
                      </button>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full-Screen Image Zoom / View Modal */}
      {selectedPreviewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <button 
            onClick={() => setSelectedPreviewImage(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
          >
            <X size={24} />
          </button>
          <img 
            src={selectedPreviewImage} 
            alt="Full Preview" 
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl" 
          />
        </div>
      )}
    </div>
  );
}
