import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { RequestProvider } from "./context/RequestContext";
import { ContractApprovalProvider } from "./context/ContractApprovalContext";
import { AdminSettingsProvider } from "./context/AdminSettingsContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { AppShellProvider } from "./context/AppShellContext";
import MainLayout from "./components/layout/MainLayout";

const Login = React.lazy(() => import("./pages/Login"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const RequestForm = React.lazy(() => import("./pages/RequestForm"));
const Performance = React.lazy(() => import("./pages/Performance"));
const Settings = React.lazy(() => import("./pages/Settings"));
const PriceList = React.lazy(() => import("./pages/PriceList"));
const Downloads = React.lazy(() => import("./pages/Downloads"));
const ContractApprovals = React.lazy(() => import("./pages/ContractApprovals"));
const ContractApprovalForm = React.lazy(() => import("./pages/ContractApprovalForm"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const detectDesktopRuntime = (): boolean => {
  const hostRuntime = String((window as any)?.__CRA_DESKTOP_HOST__?.runtime ?? "").trim().toLowerCase();
  const userAgent = typeof navigator === "undefined" ? "" : String(navigator.userAgent ?? "").toLowerCase();
  return Boolean(
    hostRuntime === "tauri" ||
    (window as any)?.__TAURI__ ||
    (window as any)?.__TAURI_INTERNALS__ ||
    (window as any)?.__TAURI_INVOKE__ ||
    (window as any)?.__TAURI_IPC__ ||
    userAgent.includes("tauri")
  );
};

let desktopReadyCallbackId = Math.floor(Date.now() % 1000000) * 2;

const invokeViaTauriIpc = (
  ipc: (message: { cmd: string; callback: number; error: number; [key: string]: any }) => void,
  command: string,
  payload: Record<string, any> = {}
) =>
  new Promise<void>((resolve, reject) => {
    desktopReadyCallbackId += 2;
    const callback = desktopReadyCallbackId;
    const error = desktopReadyCallbackId + 1;
    const callbackKey = `_${callback}`;
    const errorKey = `_${error}`;

    const cleanup = () => {
      try { delete (window as any)[callbackKey]; } catch {}
      try { delete (window as any)[errorKey]; } catch {}
    };

    Object.defineProperty(window, callbackKey, {
      configurable: true,
      writable: false,
      value: () => {
        cleanup();
        resolve();
      },
    });
    Object.defineProperty(window, errorKey, {
      configurable: true,
      writable: false,
      value: (result: any) => {
        cleanup();
        reject(result);
      },
    });

    try {
      ipc({
        cmd: command,
        callback,
        error,
        ...payload,
      });
    } catch (invokeError) {
      cleanup();
      reject(invokeError);
    }
  });

const invokeDesktopCommand = async (command: string, payload: Record<string, any> = {}): Promise<void> => {
  const tauriObj = (window as any)?.__TAURI__;
  if (typeof tauriObj?.invoke === "function") {
    await tauriObj.invoke(command, payload);
    return;
  }
  if (typeof tauriObj?.core?.invoke === "function") {
    await tauriObj.core.invoke(command, payload);
    return;
  }
  if (typeof (window as any)?.__TAURI_INTERNALS__?.invoke === "function") {
    await (window as any).__TAURI_INTERNALS__.invoke(command, payload);
    return;
  }
  if (typeof (window as any)?.__TAURI_INVOKE__ === "function") {
    await (window as any).__TAURI_INVOKE__(command, payload);
    return;
  }
  if (typeof (window as any)?.__TAURI_IPC__ === "function") {
    await invokeViaTauriIpc((window as any).__TAURI_IPC__, command, payload);
    return;
  }
};

const DesktopReadyNotifier = () => {
  const { isLoading } = useAuth();
  const location = useLocation();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current || isLoading) return;

    let cancelled = false;
    const startedAt = Date.now();
    const deadline = startedAt + 20_000;

    const trySignalReady = () => {
      if (cancelled || sentRef.current) return;
      if (Date.now() > deadline) return;

      if (!detectDesktopRuntime()) {
        window.setTimeout(trySignalReady, 350);
        return;
      }

      const payload = {
        route: location.pathname,
        timestamp: new Date().toISOString(),
      };

      void invokeDesktopCommand("desktop_webview_ready", { payload })
        .then(() => {
          sentRef.current = true;
        })
        .catch(() => {
          // Best effort only. Browser and legacy clients may not expose this command.
          window.setTimeout(trySignalReady, 500);
        });
    };

    trySignalReady();

    return () => {
      cancelled = true;
    };
  }, [isLoading, location.pathname]);

  return null;
};

const AppLoadingFallback = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-10 w-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
        <span className="text-sm">{t.common.loading}</span>
      </div>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <AuthProvider>
          <AdminSettingsProvider>
            <RequestProvider>
              <ContractApprovalProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <AppShellProvider>
                    <DesktopReadyNotifier />
                    <Suspense
                      fallback={<AppLoadingFallback />}
                    >
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route element={<MainLayout />}>
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/performance" element={<Performance />} />
                          <Route path="/requests/new" element={<RequestForm />} />
                          <Route path="/requests/:id" element={<RequestForm />} />
                          <Route path="/requests/:id/edit" element={<RequestForm />} />
                          <Route path="/contract-approvals" element={<ContractApprovals />} />
                          <Route path="/contract-approvals/new" element={<ContractApprovalForm />} />
                          <Route path="/contract-approvals/:id" element={<ContractApprovalForm />} />
                          <Route path="/contract-approvals/:id/edit" element={<ContractApprovalForm />} />
                          <Route path="/price-list" element={<PriceList />} />
                          <Route path="/downloads" element={<Downloads />} />
                          <Route path="/settings" element={<Settings />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </AppShellProvider>
                </BrowserRouter>
              </ContractApprovalProvider>
            </RequestProvider>
          </AdminSettingsProvider>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
