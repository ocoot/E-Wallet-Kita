import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import {AuthProvider} from './contexts/AuthContext';
// NOTE: './i18n.ts' (i18next) used to be imported here but was never
// actually used anywhere (no useTranslation()/i18n.t() calls exist in
// the codebase) — it was a dead, parallel translation system that
// duplicated category labels found nowhere else. The app's real i18n
// is LanguageContext.tsx + src/locales/{en,id}.json. Removed to avoid
// future drift/confusion. Delete src/i18n.ts if you haven't already.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered successfully with scope:', registration.scope);
      })
      .catch((error) => {
        console.log('[PWA] Service Worker registration failed:', error);
      });
  });
}
