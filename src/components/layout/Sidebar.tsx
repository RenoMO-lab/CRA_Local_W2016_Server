import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  Database,
  FileText,
  Languages,
  Mail,
  MessageCircle,
  Plus,
  ScrollText,
  Server,
  Settings,
  Tags,
  Users,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useAppShell } from '@/context/AppShellContext';
import { cn } from '@/lib/utils';
import LanguageSelector from '@/components/LanguageSelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  width: number;
  onResize: (width: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle: _onToggle, width, onResize }) => {
  const location = useLocation();
  const { user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { density } = useAppShell();
  const [adminOpen, setAdminOpen] = useState(location.pathname === '/settings');
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(width);

  const isSettingsActive = location.pathname === '/settings';
  const settingsTab = useMemo(() => {
    if (!isSettingsActive) return 'export';
    return new URLSearchParams(location.search).get('tab') || 'export';
  }, [isSettingsActive, location.search]);

  useEffect(() => {
    if (isSettingsActive) {
      setAdminOpen(true);
      return;
    }
    setAdminOpen(false);
  }, [isSettingsActive, location.pathname]);

  const navItems = useMemo(
    () => [
      { path: '/dashboard', labelKey: 'dashboard' as const, icon: FileText, roles: ['sales', 'design', 'costing', 'admin'] },
      { path: '/requests/new', labelKey: 'newRequest' as const, icon: Plus, roles: ['sales', 'admin'] },
      { path: '/price-list', labelKey: 'priceList' as const, icon: Tags, roles: ['sales', 'admin'] },
      { path: '/performance', labelKey: 'performance' as const, icon: BarChart3, roles: ['sales', 'design', 'costing', 'admin'] },
    ],
    []
  );

  const filteredNavItems = navItems.filter((item) => user && item.roles.includes(user.role));

  const adminNavItems = useMemo(
    () => [
      { tab: 'export', label: t.settings.export, icon: FileText },
      { tab: 'lists', label: t.settings.systemLists, icon: Settings },
      { tab: 'users', label: t.settings.usersRoles, icon: Users },
      { tab: 'offer-profile', label: t.settings.offerProfileTab, icon: FileText },
      { tab: 'feedback', label: t.settings.feedbackTab, icon: MessageCircle },
      { tab: 'm365', label: t.settings.m365Tab, icon: Mail },
      { tab: 'dbmonitor', label: t.settings.dbMonitorTab, icon: Database },
      { tab: 'auditlog', label: t.settings.auditLogTab, icon: ScrollText },
      { tab: 'deployments', label: t.settings.deploymentsTab, icon: Server },
    ],
    [t.settings]
  );

  const isActive = (path: string) => location.pathname === path;

  const startResize = (event: React.MouseEvent) => {
    if (isCollapsed) return;
    resizeStartX.current = event.clientX;
    resizeStartWidth.current = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - resizeStartX.current;
      onResize(resizeStartWidth.current + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const sidebarPadding = density === 'compact' ? 'pt-2 px-2 pb-2' : 'pt-3 px-3 pb-3';
  const sectionPadding = density === 'compact' ? 'px-2 py-2' : 'px-3 py-3';
  const navItemPadding = density === 'compact' ? 'px-3 py-2' : 'px-3 py-2.5';
  const sidebarWidth = isCollapsed ? 64 : width;

  return (
    <aside
      className="fixed left-0 top-14 bottom-8 z-40 bg-sidebar transition-[width] duration-200 flex-col hidden md:flex border-r border-sidebar-border"
      style={{ width: sidebarWidth, background: 'var(--gradient-sidebar)' }}
    >
      <nav className={cn('flex-1 overflow-y-auto scrollbar-thin', sidebarPadding)}>
        <div className="space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-lg transition-all duration-150',
                  navItemPadding,
                  active
                    ? 'bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary'
                    : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  isCollapsed && 'justify-center px-2'
                )}
              >
                <Icon size={20} className={active ? 'text-primary' : ''} />
                {!isCollapsed ? <span className="font-medium truncate">{t.nav[item.labelKey]}</span> : null}
              </Link>
            );
          })}
        </div>

        {user?.role === 'admin' ? (
          <div className={cn('pt-2', isCollapsed && 'pt-0')}>
            {isCollapsed ? (
              <Link
                to="/settings?tab=export"
                className={cn(
                  'flex items-center gap-3 rounded-lg transition-all duration-150 justify-center px-2 py-2.5',
                  isSettingsActive
                    ? 'bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary'
                    : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
                aria-label={t.nav.admin}
                title={t.nav.admin}
              >
                <Settings size={20} className={isSettingsActive ? 'text-primary' : ''} />
              </Link>
            ) : (
              <>
                <div
                  className={cn(
                    'w-full flex items-center rounded-lg transition-all duration-150 overflow-hidden',
                    isSettingsActive
                      ? 'bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary'
                      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <Link to="/settings?tab=export" onClick={() => setAdminOpen(true)} className="flex flex-1 items-center gap-3 px-3 py-2.5">
                    <Settings size={20} className={isSettingsActive ? 'text-primary' : ''} />
                    <span className="font-medium flex-1 text-left">{t.nav.admin}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAdminOpen((value) => !value);
                    }}
                    className="px-3 py-2.5 text-sidebar-muted hover:text-sidebar-foreground"
                    aria-label={adminOpen ? t.common.close : t.common.openMenu}
                    title={adminOpen ? t.common.close : t.common.openMenu}
                  >
                    <ChevronDown size={16} className={cn('transition-transform', adminOpen ? 'rotate-180' : 'rotate-0')} />
                  </button>
                </div>

                {adminOpen ? (
                  <div className="mt-1 space-y-1 pl-3">
                    {adminNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = isSettingsActive && settingsTab === item.tab;
                      return (
                        <Link
                          key={item.tab}
                          to={`/settings?tab=${encodeURIComponent(item.tab)}`}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-sm',
                            active
                              ? 'bg-sidebar-accent text-sidebar-foreground'
                              : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          )}
                        >
                          <Icon size={16} className={active ? 'text-primary' : ''} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </nav>

      <div className={cn('border-t border-sidebar-border', sectionPadding, isCollapsed && 'flex justify-center')}>
        {isCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group p-2.5 rounded-lg bg-sidebar-accent/50 hover:bg-primary/20 border border-sidebar-border hover:border-primary/40 transition-all duration-150">
                <Languages size={18} className="text-sidebar-muted group-hover:text-primary transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="center" sideOffset={8} className="min-w-[160px] bg-popover border border-border shadow-lg rounded-lg p-1">
              <DropdownMenuItem onClick={() => setLanguage('en')} className={cn(language === 'en' && 'bg-primary/10 text-primary')}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage('fr')} className={cn(language === 'fr' && 'bg-primary/10 text-primary')}>
                French
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage('zh')} className={cn(language === 'zh' && 'bg-primary/10 text-primary')}>
                Chinese
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <LanguageSelector variant="sidebar" />
        )}
      </div>

      {!isCollapsed ? (
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 transition-colors"
          onMouseDown={startResize}
          aria-hidden
        />
      ) : null}
    </aside>
  );
};

export default Sidebar;
