import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportFrontendError } from "../lib/errorReporter";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

const isIndonesian = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("id");

const COPY = isIndonesian
  ? {
      title: "Aduh, ada yang error",
      desc: "Tenang, tim sudah otomatis diberi tahu. Coba muat ulang halaman ini.",
      button: "Muat Ulang",
    }
  : {
      title: "Something went wrong",
      desc: "Don't worry, the team has been notified automatically. Try reloading this page.",
      button: "Reload",
    };

/**
 * Error boundary global. Sengaja diletakkan DI LUAR semua context provider
 * (lihat main.tsx) supaya kalau ada provider yang crash saat render
 * (mis. bug di AuthProvider/ThemeProvider), boundary ini tetap bisa
 * menangkap dan menampilkan fallback -- bukan cuma layar putih kosong.
 *
 * Karena berada di luar LanguageProvider, teks di sini hardcode
 * bilingual sederhana (deteksi dari navigator.language), bukan lewat
 * hook useLanguage().
 *
 * Error yang tertangkap dilaporkan ke tabel `error_logs` (source
 * "frontend:react-boundary") lewat reportFrontendError -- muncul di
 * Admin Panel > Monitor Error dengan componentStack di kolom context.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Render crash tertangkap:", error, errorInfo);
    void reportFrontendError({
      source: "frontend:react-boundary",
      message: error.message || String(error),
      context: {
        stack: error.stack?.slice(0, 1500) ?? null,
        componentStack: errorInfo.componentStack?.slice(0, 1500) ?? null,
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
          <div className="max-w-sm w-full text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle size={26} className="text-red-400" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-lg text-white">{COPY.title}</h1>
              <p className="font-sans text-sm text-slate-400 mt-1">{COPY.desc}</p>
            </div>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              <RefreshCw size={15} />
              {COPY.button}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
