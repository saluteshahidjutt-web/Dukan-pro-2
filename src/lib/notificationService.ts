// Device Notifications & Vibration Service for PWA & Web
// Handles background call alerts, missed call notifications, and audio-vibrate patterns

class DeviceNotificationService {
  private static instance: DeviceNotificationService;
  private activeCallNotification: Notification | null = null;
  private vibrateInterval: any = null;

  public static getInstance(): DeviceNotificationService {
    if (!DeviceNotificationService.instance) {
      DeviceNotificationService.instance = new DeviceNotificationService();
    }
    return DeviceNotificationService.instance;
  }

  // Check if browser supports Notification API
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  // Get current permission status
  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  // Request system notification permission
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (e) {
      console.warn("Notification permission request error:", e);
      return 'denied';
    }
  }

  // Start continuous vibration for incoming call (works on Android PWA & Chrome)
  public startIncomingCallVibration() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      this.stopVibration();
      try {
        navigator.vibrate([600, 300, 600, 300, 600, 300]);
        this.vibrateInterval = setInterval(() => {
          if (navigator.vibrate) {
            navigator.vibrate([600, 300, 600, 300, 600, 300]);
          }
        }, 2700);
      } catch (e) {
        console.warn("Vibrate error:", e);
      }
    }
  }

  public stopVibration() {
    if (this.vibrateInterval) {
      clearInterval(this.vibrateInterval);
      this.vibrateInterval = null;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }

  // Show System Notification for Incoming Call
  public async showIncomingCallNotification(caller: { name: string; phone?: string }, callId: string) {
    this.startIncomingCallVibration();

    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    try {
      const title = `📞 Incoming Call: ${caller.name}`;
      const options: any = {
        body: `${caller.phone ? `${caller.phone} • ` : ''}Dukaan Web Call - Tap to open & answer`,
        icon: '/pwa-icon.svg',
        badge: '/pwa-icon.svg',
        tag: `call_${callId}`,
        requireInteraction: true,
        silent: false,
        vibrate: [600, 300, 600, 300, 600, 300],
        data: { callId, url: '/' }
      };

      // Try Service Worker registration first (for PWA standalone)
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, options);
            return;
          }
        } catch (swErr) {
          console.warn("ServiceWorker notification failed, using window.Notification:", swErr);
        }
      }

      // Fallback to Window Notification
      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      this.activeCallNotification = notif;
    } catch (e) {
      console.warn("Could not display incoming call notification:", e);
    }
  }

  // Dismiss Incoming Call Notification (when answered, rejected, or ended)
  public dismissIncomingCallNotification(callId?: string) {
    this.stopVibration();

    if (this.activeCallNotification) {
      try {
        this.activeCallNotification.close();
      } catch {}
      this.activeCallNotification = null;
    }

    // Also close Service Worker notifications matching call tag
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg && reg.getNotifications) {
          reg.getNotifications({ tag: callId ? `call_${callId}` : undefined }).then(notifications => {
            notifications.forEach(n => n.close());
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  // Show System Notification for Missed Call
  public async showMissedCallNotification(caller: { name: string; phone?: string }) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    try {
      const title = `📞 Missed Call from ${caller.name}`;
      const options: any = {
        body: `${caller.phone ? `${caller.phone} • ` : ''}Tap to open chat & call back`,
        icon: '/pwa-icon.svg',
        badge: '/pwa-icon.svg',
        tag: `missed_${Date.now()}`,
        requireInteraction: false,
        vibrate: [300, 150, 300],
        data: { url: '/' }
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, options);
            return;
          }
        } catch {}
      }

      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn("Missed call notification error:", e);
    }
  }

  // Show System Notification for New Chat Message when document is hidden / background
  public async showMessageNotification(senderName: string, messageText: string, roomId?: string) {
    // Only show if page is not focused / hidden
    if (typeof document !== 'undefined' && !document.hidden) {
      return;
    }

    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    try {
      const title = `💬 ${senderName}`;
      const options: any = {
        body: messageText || 'New message',
        icon: '/pwa-icon.svg',
        badge: '/pwa-icon.svg',
        tag: `msg_${roomId || 'chat'}`,
        renotify: true,
        data: { roomId, url: '/' }
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, options);
            return;
          }
        } catch {}
      }

      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn("Message notification error:", e);
    }
  }
}

export const notificationService = DeviceNotificationService.getInstance();
