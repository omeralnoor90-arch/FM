import { useState, useEffect } from "react";
import { Download, X, Share } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isMobile() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isMobile() || isInStandaloneMode()) return;
    if (sessionStorage.getItem("pwa-dismissed") === "1") return;

    if (isIos()) {
      setShowButton(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function handleDismiss() {
    setDismissed(true);
    setShowButton(false);
    setShowIosSheet(false);
    sessionStorage.setItem("pwa-dismissed", "1");
  }

  async function handleInstall() {
    if (isIos()) {
      setShowIosSheet(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShowButton(false);
    }
    setDeferredPrompt(null);
  }

  if (!showButton || dismissed) return null;

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl cursor-pointer select-none"
        style={{ background: "#FF3C00", color: "#fff", maxWidth: "calc(100vw - 32px)" }}
        onClick={handleInstall}
        role="button"
        aria-label="Install app"
      >
        <Download size={18} className="shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">
          {isRtl ? "تثبيت التطبيق" : "Install App"}
        </span>
        <button
          className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#fff" }}
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowIosSheet(false)}
        >
          <div
            className="w-full rounded-t-2xl p-6 pb-10"
            style={{ background: "#1a1a1a", color: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <span className="font-bold text-base">
                {isRtl ? "تثبيت التطبيق" : "Add to Home Screen"}
              </span>
              <button
                onClick={() => setShowIosSheet(false)}
                style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-white" style={{ background: "#FF3C00" }}>1</div>
                <span>
                  {isRtl
                    ? "انقر على زر المشاركة في شريط أدوات Safari"
                    : "Tap the Share button in Safari's toolbar"}
                </span>
                <Share size={18} className="shrink-0 ml-auto text-blue-400" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-white" style={{ background: "#FF3C00" }}>2</div>
                <span>
                  {isRtl
                    ? 'اختر "إضافة إلى الشاشة الرئيسية"'
                    : 'Select "Add to Home Screen"'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-white" style={{ background: "#FF3C00" }}>3</div>
                <span>
                  {isRtl ? 'انقر "إضافة" للتأكيد' : 'Tap "Add" to confirm'}
                </span>
              </div>
            </div>

            <div className="mt-6 h-px" style={{ background: "#333" }} />
            <p className="mt-4 text-xs text-gray-500 text-center">
              {isRtl
                ? "يعمل التطبيق بدون إنترنت بعد التثبيت"
                : "The app works offline after installing"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
