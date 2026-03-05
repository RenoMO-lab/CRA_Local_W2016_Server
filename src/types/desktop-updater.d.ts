export {};

declare global {
  interface Window {
    __CRA_DESKTOP_UPDATER__?: {
      getCurrentVersion: () => Promise<string>;
      checkForUpdate?: (payload?: Record<string, any>) => Promise<{ available: boolean; current: string; target?: string }>;
      getCapabilities?: () => Promise<{
        inAppUpdate?: boolean;
        silentInstall?: boolean;
        autoRestart?: boolean;
      }>;
      getInstallStatus?: () => Promise<Record<string, any> | null>;
      cancelInstall?: () => Promise<{ cancelled?: boolean } | boolean | void>;
      installUpdate: (payload?: Record<string, any>) => Promise<{ started: boolean } | boolean | void>;
      restartApp: () => Promise<void>;
    };
  }
}
