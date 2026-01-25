import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Plus, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { ROLE_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';

const MobileTopNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'zh', label: '中文' },
  ];

  const navItems = [
    { path: '/dashboard', labelKey: 'dashboard' as const, roles: ['sales', 'design', 'costing', 'admin'] },
    { path: '/requests/new', labelKey: 'newRequest' as const, roles: ['sales', 'admin'] },
    { path: '/price-list', labelKey: 'priceList' as const, roles: ['sales', 'admin'] },
    { path: '/performance', labelKey: 'performance' as const, roles: ['sales', 'design', 'costing', 'admin'] },
    { path: '/settings', labelKey: 'settings' as const, roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter((item) => user && item.roles.includes(user.role));
  const showCreateButton = user?.role === 'sales' || user?.role === 'admin';
  const isActive = (path: string) => location.pathname === path;

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
                    {t.nav[item.labelKey]}
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
    </header>
  );
};

export default MobileTopNav;
