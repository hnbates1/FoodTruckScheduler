"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && webkit && !otherIosBrowser;
}

export default function PwaRuntime() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIosSafari());

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      }, { once: true });
    }

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowInstructions(false);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();
    const sync = () => {
      if (!active) return;
      const menu = document.querySelector<HTMLElement>(".user-menu");
      if (!menu) {
        setTarget(null);
        return;
      }
      let host = menu.querySelector<HTMLElement>("[data-pwa-install-root]");
      if (!host) {
        host = document.createElement("span");
        host.dataset.pwaInstallRoot = "true";
        const signOut = Array.from(menu.querySelectorAll("button")).find((button) => button.textContent?.trim().toLowerCase() === "sign out");
        if (signOut) menu.insertBefore(host, signOut); else menu.appendChild(host);
      }
      setTarget(host);
    };
    const schedule = (delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        sync();
      }, delay);
      timers.add(timer);
    };
    const interact = () => { schedule(40); schedule(300); };
    document.addEventListener("click", interact, { passive: true });
    [50, 300, 1000, 2200].forEach(schedule);
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", interact);
    };
  }, []);

  async function install() {
    if (installed) return;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    setShowInstructions(true);
  }

  if (!target || installed) return null;

  return createPortal(<>
    <style>{`
      .pwa-install-button{border:0;background:transparent;color:#76b9f6;padding:0;font-size:9px;font-weight:750;cursor:pointer;white-space:nowrap}.pwa-install-button:hover{color:#b7dcff;text-decoration:underline}
      .pwa-help-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:22px;background:#020914cc;backdrop-filter:blur(8px)}
      .pwa-help{position:relative;width:min(430px,100%);padding:27px;border:1px solid #315473;border-radius:14px;background:linear-gradient(145deg,#0e2a48,#081a2f);box-shadow:0 28px 90px #000b;color:#f4f8ff}
      .pwa-help-close{position:absolute;right:13px;top:11px;border:0;background:transparent;color:#9eb4ca;font-size:22px;cursor:pointer}.pwa-help .eyebrow{margin:0 0 7px}.pwa-help h2{margin:0 28px 9px 0;font-size:23px}.pwa-help>p{margin:0;color:#9eb4ca;font-size:11px;line-height:1.55}.pwa-steps{display:grid;gap:9px;margin:18px 0}.pwa-step{display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start;padding:10px;border:1px solid #294a68;border-radius:8px;background:#071a2f}.pwa-step b{width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:#0d75df;color:#fff;font-size:10px}.pwa-step strong,.pwa-step small{display:block}.pwa-step strong{font-size:11px}.pwa-step small{margin-top:3px;color:#829db4;font-size:9px;line-height:1.45}.pwa-help .primary{width:100%}
      @media(display-mode:standalone){.pwa-install-button{display:none!important}}@supports(padding:max(0px)){body{padding-bottom:env(safe-area-inset-bottom)}.topbar{padding-top:env(safe-area-inset-top);height:calc(64px + env(safe-area-inset-top))}}
    `}</style>
    <button className="pwa-install-button" type="button" onClick={() => void install()}>{promptEvent ? "Install App" : ios ? "Add to Home Screen" : "Install App"}</button>
    {showInstructions && <div className="pwa-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInstructions(false); }}>
      <section className="pwa-help" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title">
        <button className="pwa-help-close" type="button" aria-label="Close" onClick={() => setShowInstructions(false)}>×</button>
        <p className="eyebrow">INSTALL FOOD TRUCK ADMIN</p>
        <h2 id="pwa-help-title">{ios ? "Add It to Your Home Screen" : "Install It From Your Browser"}</h2>
        <p>{ios ? "Safari requires you to confirm installation from the Share menu." : "Use your browser’s app installation or shortcut option to open Food Truck Admin in its own window."}</p>
        <div className="pwa-steps">
          {ios ? <>
            <div className="pwa-step"><b>1</b><div><strong>Tap Safari’s Share Button</strong><small>It is the square with an upward arrow.</small></div></div>
            <div className="pwa-step"><b>2</b><div><strong>Select Add to Home Screen</strong><small>Scroll down in the Share sheet if it is not immediately visible.</small></div></div>
            <div className="pwa-step"><b>3</b><div><strong>Tap Add</strong><small>Food Truck Admin will open from its own Home Screen icon.</small></div></div>
          </> : <>
            <div className="pwa-step"><b>1</b><div><strong>Open the Browser Menu</strong><small>In Edge, look for Apps. In Chrome, look for Install Food Truck Admin.</small></div></div>
            <div className="pwa-step"><b>2</b><div><strong>Choose Install</strong><small>The site will open in a dedicated app-style window.</small></div></div>
          </>}
        </div>
        <button className="primary" type="button" onClick={() => setShowInstructions(false)}>Got It</button>
      </section>
    </div>}
  </>, target);
}
