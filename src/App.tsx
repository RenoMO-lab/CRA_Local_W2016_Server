import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RequestProvider } from "./context/RequestContext";
import { AdminSettingsProvider } from "./context/AdminSettingsContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import MainLayout from "./components/layout/MainLayout";

const Login = React.lazy(() => import("./pages/Login"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const RequestForm = React.lazy(() => import("./pages/RequestForm"));
const Performance = React.lazy(() => import("./pages/Performance"));
const Settings = React.lazy(() => import("./pages/Settings"));
const PriceList = React.lazy(() => import("./pages/PriceList"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

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
              <Toaster />
              <Sonner />
              <BrowserRouter>
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
                      <Route path="/price-list" element={<PriceList />} />
                      <Route path="/settings" element={<Settings />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </RequestProvider>
          </AdminSettingsProvider>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
