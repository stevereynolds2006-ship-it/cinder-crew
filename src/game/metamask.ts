import type { FriendWalletProvider } from "@rarefriends/friendsdk/wallet";

type Injected = FriendWalletProvider & {
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isOkxWallet?: boolean;
  providers?: Injected[];
  _metamask?: unknown;
  off?: FriendWalletProvider["removeListener"];
};

function isInjected(value: unknown): value is Injected {
  if (!value || typeof value !== "object") return false;
  const provider = value as Injected;
  return typeof provider.request === "function" && typeof provider.on === "function";
}

/** Brave, Rabby, and Phantom also set isMetaMask. Skip those forks. */
export function isMetaMaskProvider(value: unknown): value is Injected {
  if (!isInjected(value)) return false;
  if (value.isBraveWallet || value.isRabby || value.isPhantom || value.isCoinbaseWallet || value.isTrust || value.isOkxWallet) {
    return false;
  }
  return value.isMetaMask === true || (typeof value._metamask === "object" && value._metamask !== null);
}

export function findMetaMaskProvider(): FriendWalletProvider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as Window & { ethereum?: Injected }).ethereum;
  if (!ethereum) return null;
  const fromList = Array.isArray(ethereum.providers) ? ethereum.providers.find(isMetaMaskProvider) : undefined;
  const raw = fromList ?? (isMetaMaskProvider(ethereum) ? ethereum : null);
  if (!raw) return null;
  return {
    request: (args) => raw.request(args),
    on: (event, listener) => raw.on(event, listener),
    removeListener: (event, listener) => {
      if (typeof raw.removeListener === "function") raw.removeListener(event, listener);
      else raw.off?.(event, listener);
    },
  };
}

/** MetaMask's own mobile browser. Its webview is the whole screen; the OS fullscreen button does not apply. */
export function inMetaMaskBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MetaMaskMobile/i.test(navigator.userAgent);
}

/** Visible webview height. MetaMask's browser lies about 100vh, so the shell uses this instead. */
export function syncVisibleViewport(): void {
  if (typeof window === "undefined") return;
  const viewport = window.visualViewport;
  const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
  const top = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
  const root = document.documentElement;
  root.style.setProperty("--app-h", `${height}px`);
  root.style.setProperty("--app-top", `${top}px`);
}
export function metaMaskDappUrl(): string | null {
  if (typeof window === "undefined") return null;
  const { host, pathname, search } = window.location;
  if (!host || host.startsWith("127.") || host.startsWith("localhost") || host.startsWith("0.0.0.0")) return null;
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}
