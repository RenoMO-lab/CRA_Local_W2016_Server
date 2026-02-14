import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Plus, MessageCircle, Laptop, Sun, Moon, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { ROLE_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import AccountDialog from '@/components/account/AccountDialog';

const MobileTopNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'zh', label: '中文' },
  ];

  const settingsTab = (() => {
    if (location.pathname !== '/settings') return 'lists';
    return new URLSearchParams(location.search).get('tab') || 'lists';
  })();

  const navItems = [
    { path: '/dashboard', label: t.nav.dashboard, roles: ['sales', 'design', 'costing', 'admin'] },
    { path: '/requests/new', label: t.nav.newRequest, roles: ['sales', 'admin'] },
    { path: '/price-list', label: t.nav.priceList, roles: ['sales', 'admin'] },
    { path: '/performance', label: t.nav.performance, roles: ['sales', 'design', 'costing', 'admin'] },
    ...(user?.role === 'admin'
      ? [
          { path: '/settings?tab=lists', label: t.settings.systemLists, roles: ['admin'] },
          { path: '/settings?tab=users', label: t.settings.usersRoles, roles: ['admin'] },
          { path: '/settings?tab=feedback', label: t.settings.feedbackTab, roles: ['admin'] },
          { path: '/settings?tab=m365', label: t.settings.m365Tab, roles: ['admin'] },
          { path: '/settings?tab=dbmonitor', label: t.settings.dbMonitorTab, roles: ['admin'] },
          { path: '/settings?tab=auditlog', label: t.settings.auditLogTab, roles: ['admin'] },
          { path: '/settings?tab=deployments', label: t.settings.deploymentsTab, roles: ['admin'] },
        ]
      : []),
  ];

  const filteredNavItems = navItems.filter((item) => user && item.roles.includes(user.role));
  const showCreateButton = user?.role === 'sales' || user?.role === 'admin';
  const isActive = (path: string) => {
    if (path.startsWith('/settings?')) {
      if (location.pathname !== '/settings') return false;
      const tab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'lists';
      return settingsTab === tab;
    }
    return location.pathname === path;
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
            <Button size="sm" variant="default" onClick={() => navigate('/requests/new')} className="h-8 px-2.5 text-xs">
              <Plus size={14} className="mr-1" />
              {t.nav.newRequest}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.common.openMenu} className="h-8 w-8">
                <Menu size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-card border border-border shadow-lg">
              {user && (
                <div className="px-3 py-2 border-b border-border">
                  <div className="font-medium text-sm text-foreground truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.roles[user.role] || ROLE_CONFIG[user.role].label}
                  </div>
                </div>
              )}
              <div className="py-1">
                {filteredNavItems.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn("cursor-pointer", isActive(item.path) && 'bg-primary/10 text-primary font-medium')}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <div className="py-1">
                <FeedbackDialog
                  trigger={
                    <DropdownMenuItem className="cursor-pointer">
                      <MessageCircle size={14} className="mr-2" />
                      {t.feedback.reportIssue}
                    </DropdownMenuItem>
                  }
                />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setIsAccountOpen(true)} className="cursor-pointer">
                <KeyRound size={14} className="mr-2" />
                {t.account.myAccount}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="py-1">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer">
                    <Laptop size={14} className="mr-2" />
                    {t.common.theme}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="min-w-[180px] bg-popover border border-border shadow-lg rounded-lg p-1">
                      <DropdownMenuRadioGroup value={(theme || "system") as any} onValueChange={setTheme}>
                        <DropdownMenuRadioItem value="system" className="flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent">
                          <Laptop size={14} className="opacity-80" />
                          {t.common.themeSystem}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="light" className="flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent">
                          <Sun size={14} className="opacity-80" />
                          {t.common.themeLight}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark" className="flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent">
                          <Moon size={14} className="opacity-80" />
                          {t.common.themeDark}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </div>
              <DropdownMenuSeparator />
              <div className="py-1">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLanguage(lang.code as any)}
                    className={cn("cursor-pointer", language === lang.code && 'bg-primary/10 text-primary')}
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut size={14} className="mr-2" />
                {t.nav.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />
    </header>
  );
};

export default MobileTopNav;
