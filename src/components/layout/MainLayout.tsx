import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Sidebar from './Sidebar';
import MobileTopNav from './MobileTopNav';
import { cn } from '@/lib/utils';

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    <div className="min-h-screen bg-background">
      <MobileTopNav />
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      
      <main 
        className={cn(
          "min-h-screen transition-all duration-300 p-3 sm:p-4 md:p-6",
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        )}
      >
        <div className="w-full max-w-7xl mx-auto animate-fade-in pb-20 md:pb-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
