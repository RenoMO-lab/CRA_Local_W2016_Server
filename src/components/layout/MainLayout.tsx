import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAppShell } from '@/context/AppShellContext';
import Sidebar from './Sidebar';
import MobileTopNav from './MobileTopNav';
import DesktopAppChrome from './DesktopAppChrome';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import { cn } from '@/lib/utils';

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { sidebarWidth, setSidebarWidth, density } = useAppShell();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const desktopSidebarWidth = sidebarCollapsed ? 64 : sidebarWidth;
  const layoutStyle: React.CSSProperties = {
    ['--cra-sidebar-width' as const]: `${desktopSidebarWidth}px`,
    ['--cra-desktop-topbar-height' as const]: '56px',
    ['--cra-desktop-bottombar-height' as const]: '32px',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={layoutStyle}
    >
      <MobileTopNav />
      <DesktopAppChrome
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        width={desktopSidebarWidth}
        onResize={setSidebarWidth}
      />

      <div className="hidden">
        <FeedbackDialog trigger={<span />} />
      </div>
      
      <main 
        className={cn(
          'min-h-screen transition-all duration-300',
          'md:pt-[calc(var(--cra-desktop-topbar-height)+8px)] md:pb-[calc(var(--cra-desktop-bottombar-height)+16px)] md:ml-[var(--cra-sidebar-width)]',
          density === 'compact' ? 'p-2 sm:p-3 md:px-3' : 'p-3 sm:p-4 md:px-6'
        )}
      >
        <div className="w-full animate-fade-in pb-20 md:pb-0 transition-all duration-300">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
