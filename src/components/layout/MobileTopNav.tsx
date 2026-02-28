import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Menu,
  Plus,
  Settings,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import UserHubMenu from '@/components/layout/UserHubMenu';
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
  const { user } = useAuth();
  const { t } = useLanguage();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
          { tab: 'offer-profile', label: t.settings.offerProfileTab },
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

          {user ? (
            <UserHubMenu
              trigger={
                <Button variant="outline" className="h-8 gap-1 px-1.5 max-w-[138px]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-[11px] font-medium">{user.name}</span>
                </Button>
              }
              contentAlign="end"
              contentSide="bottom"
              contentSideOffset={8}
            />
          ) : null}

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
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};

export default MobileTopNav;
