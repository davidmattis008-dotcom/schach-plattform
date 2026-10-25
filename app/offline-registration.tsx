'use client';

import { useEffect } from 'react';

export default function OfflineRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => registration.update())
        .catch((error: unknown) => {
          console.error('Der Service Worker für den geschützten Onlinebetrieb konnte nicht aktualisiert werden:', error);
        });
    }
  }, []);

  return null;
}
