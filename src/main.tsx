/// <reference types="vite-plugin-pwa/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA
registerSW({ immediate: true });

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error("Dukan Pro Bootstrap Error:", error);
  document.body.innerHTML = `
    <div style="font-family: sans-serif; padding: 20px; text-align: center;">
      <h1>App Failed to Start</h1>
      <p>This is usually due to an incompatible browser or blocked scripts.</p>
      <pre style="background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px;">${error}</pre>
    </div>
  `;
}
