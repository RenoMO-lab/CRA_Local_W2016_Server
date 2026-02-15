import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  KeyRound,
  Laptop,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  Settings,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AccountDialog from '@/components/account/AccountDialog';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { ROLE_CONFIG } from '@/types';

type DrawerItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

const DrawerItem = React.forwardRef<HTMLButtonElement, DrawerItemProps>(
  ({ active, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors',
        'hover:bg-accent hover:text-foreground',
        active && 'bg-primary/10 text-primary font-medium hover:bg-primary/10 hover:text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
DrawerItem.displayName = 'DrawerItem';

const MobileTopNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Fran莽ais' },
    { code: 'zh', label: '涓枃' },
  ];

  const settingsTab = (() => {
    if (location.pathname !== '/settings') return 'export';
    return new URLSearchParams(location.search).get('tab') || 'export';
  })();
  const isSettingsActive = location.pathname === '/settings';

  const [adminOpen, setAdminOpen] = useState(isSettingsActive);
  useEffect(() => {
    if (isSettingsActive) setAdminOpen(true);
  }, [isSettingsActive]);

  const navItems = [
    { path: '/dashboard', label: t.nav.dashboard, roles: ['sales', 'design', 'costing', 'admin'] },
    { path: '/requests/new', label: t.nav.newRequest, roles: ['sales', 'admin'] },
    { path: '/price-list', label: t.nav.priceList, roles: ['sales', 'admin'] },
    { path: '/performance', label: t.nav.performance, roles: ['sales', 'design', 'costing', 'admin'] },
  ];

  const filteredNavItems = navItems.filter((item) => user && item.roles.includes(user.role));
  const adminNavItems =
    user?.role === 'admin'
      ? [
          { tab: 'export', label: t.settings.export },
          { tab: 'lists', label: t.settings.systemLists },
          { tab: 'users', label: t.settings.usersRoles },
          { tab: 'feedback', label: t.settings.feedbackTab },
          { tab: 'm365', label: t.settings.m365Tab },
          { tab: 'dbmonitor', label: t.settings.dbMonitorTab },
          { tab: 'auditlog', label: t.settings.auditLogTab },
          { tab: 'deployments', label: t.settings.deploymentsTab },
        ]
      : [];

  const showCreateButton = user?.role === 'sales' || user?.role === 'admin';

  const isActive = (path: string) => {
    if (path.startsWith('/settings?')) {
      if (location.pathname !== '/settings') return false;
      const tab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'lists';
      return settingsTab === tab;
    }
    return location.pathname === path;
  };

  const closeAndNavigate = (path: string) => {
    setIsMenuOpen(false);
    navigate(path);
  };

  return (
    <header className="md:hidden border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <img src="/monroc-favicon.png?v=3" alt="Monroc" className="h-7 w-7 object-contain" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">Monroc</span>
            <span className="text-[10px] text-muted-foreground leading-tight">CRA</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {showCreateButton && location.pathname !== '/requests/new' && (
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate('/requests/new')}
              className="h-8 px-2.5 text-xs"
            >
              <Plus size={14} className="mr-1" />
              {t.nav.newRequest}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label={t.common.openMenu}
            className="h-8 w-8"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={18} />
          </Button>
        </div>
      </div>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="right" className="p-0 bg-card border-border">
          <div className="flex h-full flex-col">
            {user ? (
              <div className="px-4 py-4 border-b border-border">
                <div className="font-semibold text-base text-foreground truncate pr-10">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.roles[user.role] || ROLE_CONFIG[user.role].label}
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 border-b border-border">
                <div className="font-semibold text-base text-foreground truncate pr-10">Monroc CRA</div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
              <div className="space-y-1">
                {filteredNavItems.map((item) => (
                  <DrawerItem
                    key={item.path}
                    active={isActive(item.path)}
                    onClick={() => closeAndNavigate(item.path)}
                  >
                    {item.label}
                  </DrawerItem>
                ))}
              </div>

              {adminNavItems.length ? (
                <div className="mt-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setAdminOpen((v) => !v)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors',
                      'hover:bg-accent hover:text-foreground',
                      isSettingsActive && 'bg-primary/10 text-primary font-medium hover:bg-primary/10 hover:text-primary',
                    )}
                    aria-expanded={adminOpen}
                  >
                    <Settings size={16} />
                    <span className="flex-1">{t.nav.admin}</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', adminOpen ? 'rotate-180' : 'rotate-0')}
                    />
                  </button>

                  {adminOpen ? (
                    <div className="mt-1 space-y-1 pl-3">
                      {adminNavItems.map((it) => {
                        const path = `/settings?tab=${encodeURIComponent(it.tab)}`;
                        return (
                          <DrawerItem
                            key={it.tab}
                            active={isActive(path)}
                            onClick={() => closeAndNavigate(path)}
                            className="text-[13px] py-2"
                          >
                            {it.label}
                          </DrawerItem>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 pt-2 border-t border-border space-y-1">
                <FeedbackDialog
                  trigger={
                    <DrawerItem>
                      <MessageCircle size={16} />
                      <span className="flex-1">{t.feedback.reportIssue}</span>
                    </DrawerItem>
                  }
                />

                <DrawerItem
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsAccountOpen(true);
                  }}
                >
                  <KeyRound size={16} />
                  <span className="flex-1">{t.account.myAccount}</span>
                </DrawerItem>
              </div>

              <div className="mt-2 pt-2 border-t border-border">
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.common.theme}
                </div>
                <div className="px-2 grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-[11px] leading-tight transition-colors',
                      (theme || 'system') === 'system'
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'hover:bg-accent',
                    )}
                  >
                    <Laptop size={14} className="opacity-80" />
                    <span className="font-medium">{t.common.themeSystem}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-[11px] leading-tight transition-colors',
                      theme === 'light' ? 'bg-primary/10 text-primary border-primary/30' : 'hover:bg-accent',
                    )}
                  >
                    <Sun size={14} className="opacity-80" />
                    <span className="font-medium">{t.common.themeLight}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-[11px] leading-tight transition-colors',
                      theme === 'dark' ? 'bg-primary/10 text-primary border-primary/30' : 'hover:bg-accent',
                    )}
                  >
                    <Moon size={14} className="opacity-80" />
                    <span className="font-medium">{t.common.themeDark}</span>
                  </button>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-border">
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.common.language}
                </div>
                <div className="px-2 grid grid-cols-1 gap-1">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLanguage(lang.code as any)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors',
                        language === lang.code
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'hover:bg-accent',
                      )}
                    >
                      <span className="font-medium">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-border p-2">
              <DrawerItem
                onClick={() => {
                  setIsMenuOpen(false);
                  logout();
                }}
                className="text-destructive hover:text-destructive"
              >
                <LogOut size={16} />
                <span className="flex-1">{t.nav.logout}</span>
              </DrawerItem>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />
    </header>
  );
};

export default MobileTopNav;
