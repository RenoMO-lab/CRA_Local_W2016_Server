export {};

declare global {
  type CraDesktopUpdaterDiagnosticsState =
    | 'unknown'
    | 'ready'
    | 'not_desktop_runtime'
    | 'bridge_missing'
    | 'invoke_unavailable'
    | 'bridge_incomplete'
    | 'legacy_updater_missing_commands'
    | 'legacy_version_detected'
    | 'capability_disabled'
    | 'version_unavailable'
    | 'prepare_failed';

  interface CraDesktopAboutInfo {
    version?: string | null;
    title?: string | null;
    app_host?: string | null;
  }

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
      pingUpdater?: () => Promise<{ ok?: boolean } | boolean | void>;
    };
    __CRA_DESKTOP_HOST__?: {
      runtime?: string;
      bridgeVersion?: number;
    };
    __TAURI__?: {
      invoke?: (command: string, payload?: Record<string, any>) => Promise<any>;
      core?: {
        invoke?: (command: string, payload?: Record<string, any>) => Promise<any>;
      };
    };
    __TAURI_INVOKE__?: (command: string, payload?: Record<string, any>) => Promise<any>;
    __CRA_DESKTOP_UPDATER_DIAGNOSTICS__?: {
      state: CraDesktopUpdaterDiagnosticsState;
      detail: string;
      updatedAt: string;
    };
  }
}
