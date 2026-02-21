import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAppShell } from '@/context/AppShellContext';
import Sidebar from './Sidebar';
import MobileTopNav from './MobileTopNav';
import DesktopAppChrome from './DesktopAppChrome';
import { cn } from '@/lib/utils';

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { sidebarWidth, setSidebarWidth, density } = useAppShell();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const desktopSidebarWidth = sidebarCollapsed ? 64 : sidebarWidth;
  const layoutStyle: React.CSSProperties = {
    ['--cra-sidebar-width' as '--cra-sidebar-width']: `${desktopSidebarWidth}px`,
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
      
      <main 
        className={cn(
          'min-h-screen transition-all duration-300',
          'md:pt-[96px] md:pb-10 md:ml-[var(--cra-sidebar-width)]',
          density === 'compact' ? 'p-3 sm:p-4 md:px-4 md:pb-4' : 'p-3 sm:p-4 md:px-6 md:pb-6'
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
