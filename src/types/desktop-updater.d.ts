export {};

declare global {
  interface Window {
    __CRA_DESKTOP_UPDATER__?: {
      getCurrentVersion: () => Promise<string>;
      checkForUpdate?: (payload?: Record<string, any>) => Promise<{ available: boolean; current: string; target?: string }>;
      installUpdate: (payload?: Record<string, any>) => Promise<{ started: boolean } | boolean | void>;
      restartApp: () => Promise<void>;
    };
  }
}
