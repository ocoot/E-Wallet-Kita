/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// P4 4.8: deklarasi tipe manual untuk View Transitions API -- belum
// termasuk di lib "DOM" TypeScript versi project ini, tapi API-nya sudah
// tersedia di browser modern (Chrome/Edge/Safari terbaru). Dipakai di
// ThemeContext.tsx untuk crossfade halus saat berpindah tema, dengan
// pengecekan `typeof document.startViewTransition === "function"` sehingga
// aman di browser yang belum mendukungnya.
interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    finished: Promise<void>;
    skipTransition: () => void;
  };
}
