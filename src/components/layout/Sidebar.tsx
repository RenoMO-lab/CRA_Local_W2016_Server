import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  KeyRound,
  Languages,
  Laptop,
  LifeBuoy,
  LogOut,
  Mail,
  MessageCircle,
  Moon,
  MoreVertical,
  Plus,
  ScrollText,
  Server,
  Settings,
  Sun,
  Tags,
  Users,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useAppShell } from '@/context/AppShellContext';
import { cn } from '@/lib/utils';
import { ROLE_CONFIG, UserRole } from '@/types';
import LanguageSelector from '@/components/LanguageSelector';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import HelpDialog from '@/components/help/HelpDialog';
import AccountDialog from '@/components/account/AccountDialog';
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

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle, width, onResize }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { density } = useAppShell();
  const { theme, setTheme } = useTheme();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(location.pathname === '/settings');
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const themeCloseTimerRef = useRef<number | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(width);

  const isSettingsActive = location.pathname === '/settings';
  const settingsTab = useMemo(() => {
    if (!isSettingsActive) return 'export';
    return new URLSearchParams(location.search).get('tab') || 'export';
  }, [isSettingsActive, location.search]);

  useEffect(() => {
    if (isSettingsActive) setAdminOpen(true);
  }, [isSettingsActive]);

  useEffect(() => {
    if (themeCloseTimerRef.current !== null) {
      window.clearTimeout(themeCloseTimerRef.current);
      themeCloseTimerRef.current = null;
    }
    setIsAccountMenuOpen(false);
    setIsThemeMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        if (themeCloseTimerRef.current !== null) {
          window.clearTimeout(themeCloseTimerRef.current);
          themeCloseTimerRef.current = null;
        }
        setIsAccountMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (themeCloseTimerRef.current !== null) {
          window.clearTimeout(themeCloseTimerRef.current);
          themeCloseTimerRef.current = null;
        }
        setIsAccountMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    return () => {
      if (themeCloseTimerRef.current !== null) {
        window.clearTimeout(themeCloseTimerRef.current);
        themeCloseTimerRef.current = null;
      }
    };
  }, []);

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
      { tab: 'feedback', label: t.settings.feedbackTab, icon: MessageCircle },
      { tab: 'm365', label: t.settings.m365Tab, icon: Mail },
      { tab: 'dbmonitor', label: t.settings.dbMonitorTab, icon: Database },
      { tab: 'auditlog', label: t.settings.auditLogTab, icon: ScrollText },
      { tab: 'deployments', label: t.settings.deploymentsTab, icon: Server },
    ],
    [t.settings]
  );

  const isActive = (path: string) => location.pathname === path;

  const getRoleLabel = (role: UserRole) => t.roles[role] || ROLE_CONFIG[role].label;

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

  const sidebarPadding = density === 'compact' ? 'p-2' : 'p-3';
  const sectionPadding = density === 'compact' ? 'px-2 py-2' : 'px-3 py-3';
  const navItemPadding = density === 'compact' ? 'px-3 py-2' : 'px-3 py-2.5';
  const sidebarWidth = isCollapsed ? 64 : width;
  const accountActionClass =
    'w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';
  const themeOptionClass =
    'w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

  const clearThemeCloseTimer = () => {
    if (themeCloseTimerRef.current !== null) {
      window.clearTimeout(themeCloseTimerRef.current);
      themeCloseTimerRef.current = null;
    }
  };

  const handleThemeSelect = (nextTheme: 'system' | 'light' | 'dark') => {
    setTheme(nextTheme);
    setIsThemeMenuOpen(false);
    clearThemeCloseTimer();
    themeCloseTimerRef.current = window.setTimeout(() => {
      setIsAccountMenuOpen(false);
      themeCloseTimerRef.current = null;
    }, 140);
  };

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen pb-8 bg-sidebar transition-[width] duration-200 flex-col hidden md:flex border-r border-sidebar-border"
      style={{ width: sidebarWidth, background: 'var(--gradient-sidebar)' }}
    >
      <div className={cn('border-b border-sidebar-border', isCollapsed ? 'p-3' : 'p-4')}>
        <div className={cn('flex', isCollapsed ? 'justify-center' : 'items-start justify-between')}>
          <div className={cn('flex', isCollapsed ? 'justify-center' : 'items-center gap-3')}>
            <img
              src="/monroc-favicon.png?v=5"
              alt="Monroc"
              className={cn('transition-all duration-200 ease-in-out flex-shrink-0 object-contain', isCollapsed ? 'h-10 w-10' : 'h-14 w-14')}
            />
            {!isCollapsed ? (
              <div className="flex flex-col">
                <span className="font-bold text-sidebar-foreground text-lg leading-tight tracking-tight">CRA</span>
                <span className="text-[10px] text-sidebar-muted leading-tight">{t.branding.customerRequestAnalysis}</span>
              </div>
            ) : null}
          </div>
          {!isCollapsed ? (
            <button
              type="button"
              onClick={onToggle}
              className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex justify-center p-2 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label={t.common.openMenu}
        >
          <ChevronRight size={18} />
        </button>
      ) : null}

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

      <div className={cn('border-t border-sidebar-border', sectionPadding)}>
        {user ? (
          <div ref={accountMenuRef} className="relative">
            {!isCollapsed && isAccountMenuOpen ? (
              <div
                className={cn(
                  'absolute bottom-full left-0 right-0 z-[70] border border-sidebar-border border-b-0 rounded-t-lg rounded-b-none bg-sidebar-accent shadow-xl',
                  density === 'compact' ? 'p-1.5 space-y-0.5' : 'p-2 space-y-1'
                )}
              >
                <button
                  type="button"
                  className={accountActionClass}
                  onClick={() => {
                    clearThemeCloseTimer();
                    setIsAccountMenuOpen(false);
                    setIsThemeMenuOpen(false);
                    window.dispatchEvent(new CustomEvent('feedback:open'));
                  }}
                >
                  <MessageCircle size={14} />
                  {t.feedback.reportIssue}
                </button>
                <HelpDialog
                  trigger={
                    <button type="button" className={accountActionClass}>
                      <LifeBuoy size={14} />
                      {t.common.help}
                    </button>
                  }
                />

                <div className="h-px bg-sidebar-border my-1" />

                <button
                  type="button"
                  className={accountActionClass}
                  onClick={() => {
                    clearThemeCloseTimer();
                    setIsAccountOpen(true);
                    setIsAccountMenuOpen(false);
                    setIsThemeMenuOpen(false);
                  }}
                >
                  <KeyRound size={14} />
                  {t.account.myAccount}
                </button>

                <div className="h-px bg-sidebar-border my-1" />

                <div className="relative">
                  <button
                    type="button"
                    className={accountActionClass}
                    onClick={() => {
                      clearThemeCloseTimer();
                      setIsThemeMenuOpen((value) => !value);
                    }}
                  >
                    <Laptop size={14} />
                    <span className="flex-1 text-left">{t.common.theme}</span>
                    <ChevronRight size={14} className={cn('transition-transform', isThemeMenuOpen && 'text-primary')} />
                  </button>
                  {isThemeMenuOpen ? (
                    <div className="absolute left-[calc(100%+8px)] top-0 z-[80] w-[196px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-1">
                      {[
                        { key: 'system', label: t.common.themeSystem, icon: Laptop },
                        { key: 'light', label: t.common.themeLight, icon: Sun },
                        { key: 'dark', label: t.common.themeDark, icon: Moon },
                      ].map((option) => {
                        const Icon = option.icon;
                        const active = (theme || 'system') === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={cn(themeOptionClass, active && 'text-primary')}
                            onClick={() => handleThemeSelect(option.key as 'system' | 'light' | 'dark')}
                          >
                            <Icon size={13} />
                            <span className="flex-1 text-left">{option.label}</span>
                            {active ? <Check size={12} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="h-px bg-sidebar-border my-1" />

                <button
                  type="button"
                  className={cn(accountActionClass, 'text-destructive hover:text-destructive')}
                  onClick={() => {
                    clearThemeCloseTimer();
                    setIsAccountMenuOpen(false);
                    setIsThemeMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={14} />
                  {t.nav.logout}
                </button>
              </div>
            ) : null}

            <div
              className={cn(
                'bg-sidebar-accent border border-sidebar-border',
                !isCollapsed && isAccountMenuOpen ? 'rounded-b-lg rounded-t-none border-t-0' : 'rounded-lg',
                density === 'compact' ? 'p-2' : 'p-3'
              )}
            >
              <div className={cn('flex items-start gap-2', isCollapsed ? 'flex-col items-center' : 'justify-between')}>
                {!isCollapsed ? (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
                    <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
                    <span className={cn('inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium', ROLE_CONFIG[user.role].color)}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                ) : (
                  <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium', ROLE_CONFIG[user.role].color)}>
                    {user.name.charAt(0)}
                  </span>
                )}

                {isCollapsed ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-sidebar-muted hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label={t.common.actions}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="end" sideOffset={8} className="min-w-[190px]">
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          window.dispatchEvent(new CustomEvent('feedback:open'));
                        }}
                      >
                        <MessageCircle size={14} className="mr-2" />
                        {t.feedback.reportIssue}
                      </DropdownMenuItem>
                      <HelpDialog
                        trigger={
                          <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                            <LifeBuoy size={14} className="mr-2" />
                            {t.common.help}
                          </DropdownMenuItem>
                        }
                      />
                      <DropdownMenuItem onSelect={() => setIsAccountOpen(true)}>
                        <KeyRound size={14} className="mr-2" />
                        {t.account.myAccount}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTheme('system')}>
                        <Laptop size={14} className="mr-2" />
                        {t.common.themeSystem}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTheme('light')}>
                        <Sun size={14} className="mr-2" />
                        {t.common.themeLight}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTheme('dark')}>
                        <Moon size={14} className="mr-2" />
                        {t.common.themeDark}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
                        <LogOut size={14} className="mr-2" />
                        {t.nav.logout}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
                    type="button"
                    className="p-2 rounded-lg text-sidebar-muted hover:text-primary hover:bg-primary/10 transition-colors"
                    aria-label={t.common.actions}
                    aria-expanded={isAccountMenuOpen}
                    onClick={() => {
                      clearThemeCloseTimer();
                      setIsAccountMenuOpen((value) => !value);
                      setIsThemeMenuOpen(false);
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden">
        <FeedbackDialog trigger={<span />} />
      </div>

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />

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
