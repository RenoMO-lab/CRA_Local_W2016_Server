import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Plus, Settings, LogOut, ChevronLeft, ChevronDown, Menu, Users, BarChart3, Languages, Tags, MessageCircle, LifeBuoy, MoreVertical, Laptop, Sun, Moon, KeyRound, Mail, Database, Server, ScrollText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { ROLE_CONFIG, UserRole } from '@/types';
import LanguageSelector from '@/components/LanguageSelector';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import HelpDialog from '@/components/help/HelpDialog';
import { useTheme } from "next-themes";
import AccountDialog from '@/components/account/AccountDialog';
interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}
const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle
}) => {
  const location = useLocation();
  const {
    user,
    logout
  } = useAuth();
  const {
    t,
    language,
    setLanguage
  } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'zh', label: '中文' },
  ];
  const isSettingsActive = location.pathname === '/settings';
  const settingsTab = useMemo(() => {
    if (!isSettingsActive) return 'export';
    return new URLSearchParams(location.search).get('tab') || 'export';
  }, [isSettingsActive, location.search]);
  const [adminOpen, setAdminOpen] = useState(isSettingsActive);
  useEffect(() => {
    if (isSettingsActive) setAdminOpen(true);
  }, [isSettingsActive]);
  const isActive = (path: string) => location.pathname === path;
  const navItems = [{
    path: '/dashboard',
    labelKey: 'dashboard' as const,
    icon: LayoutDashboard,
    roles: ['sales', 'design', 'costing', 'admin']
  }, {
    path: '/requests/new',
    labelKey: 'newRequest' as const,
    icon: Plus,
    roles: ['sales', 'admin']
  }, {
    path: '/price-list',
    labelKey: 'priceList' as const,
    icon: Tags,
    roles: ['sales', 'admin']
  }, {
    path: '/performance',
    labelKey: 'performance' as const,
    icon: BarChart3,
    roles: ['sales', 'design', 'costing', 'admin']
  }];
  const filteredNavItems = navItems.filter(item => user && item.roles.includes(user.role));

  const adminNavItems = useMemo(() => ([
    { tab: 'export', label: t.settings.export, icon: FileText },
    { tab: 'lists', label: t.settings.systemLists, icon: Settings },
    { tab: 'users', label: t.settings.usersRoles, icon: Users },
    { tab: 'feedback', label: t.settings.feedbackTab, icon: MessageCircle },
    { tab: 'm365', label: t.settings.m365Tab, icon: Mail },
    { tab: 'dbmonitor', label: t.settings.dbMonitorTab, icon: Database },
    { tab: 'auditlog', label: t.settings.auditLogTab, icon: ScrollText },
    { tab: 'deployments', label: t.settings.deploymentsTab, icon: Server },
  ]), [t.settings]);

  // Get translated role label
  const getRoleLabel = (role: UserRole) => {
    return t.roles[role] || ROLE_CONFIG[role].label;
  };
  return <aside className={cn("fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 flex flex-col hidden md:flex", isCollapsed ? "w-16" : "w-64")} style={{
    background: 'var(--gradient-sidebar)'
  }}>
      {/* Header */}
      <div className={cn("border-b border-sidebar-border", isCollapsed ? "p-3" : "p-4")}>
        <div className={cn("flex", isCollapsed ? "justify-center" : "items-start justify-between")}>
          <div className={cn("flex", isCollapsed ? "justify-center" : "items-center gap-3")}>
            <img
              src="/monroc-favicon.png?v=2"
              alt="Monroc"
              className={cn("transition-all duration-300 ease-in-out flex-shrink-0 object-contain", isCollapsed ? "h-10 w-10" : "h-16 w-16")}
            />
            {!isCollapsed && <div className="flex flex-col">
                <span className="font-bold text-sidebar-foreground text-lg leading-tight tracking-tight">CRA</span>
                <span className="text-[10px] text-sidebar-muted leading-tight">{t.branding.customerRequestAnalysis}</span>
              </div>}
          </div>
          {!isCollapsed && <button onClick={onToggle} className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0">
              <ChevronLeft size={18} />
            </button>}
        </div>
      </div>
      {isCollapsed && <button onClick={onToggle} className="w-full flex justify-center p-2 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
          <Menu size={20} />
        </button>}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
        {filteredNavItems.map(item => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return <Link key={item.path} to={item.path} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200", active ? "bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground", isCollapsed && "justify-center px-2")}>
              <Icon size={20} className={active ? "text-primary" : ""} />
              {!isCollapsed && <span className="font-medium">{t.nav[item.labelKey]}</span>}
            </Link>;
      })}

        {user?.role === 'admin' && (
          <div className={cn("pt-2", isCollapsed && "pt-0")}>
            {isCollapsed ? (
              <Link
                to="/settings?tab=export"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isSettingsActive
                    ? "bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  "justify-center px-2"
                )}
                aria-label={t.nav.admin}
                title={t.nav.admin}
              >
                <Settings size={20} className={isSettingsActive ? "text-primary" : ""} />
              </Link>
            ) : (
              <>
                <div
                  className={cn(
                    "w-full flex items-center rounded-lg transition-all duration-200 overflow-hidden",
                    isSettingsActive
                      ? "bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary"
                      : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Link
                    to="/settings?tab=export"
                    onClick={() => setAdminOpen(true)}
                    className="flex flex-1 items-center gap-3 px-3 py-2.5"
                  >
                    <Settings size={20} className={isSettingsActive ? "text-primary" : ""} />
                    <span className="font-medium flex-1 text-left">{t.nav.admin}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAdminOpen((v) => !v);
                    }}
                    className="px-3 py-2.5 text-sidebar-muted hover:text-sidebar-foreground"
                    aria-label={adminOpen ? t.common.close : t.common.openMenu}
                    title={adminOpen ? t.common.close : t.common.openMenu}
                  >
                    <ChevronDown size={16} className={cn("transition-transform", adminOpen ? "rotate-180" : "rotate-0")} />
                  </button>
                </div>

                {adminOpen ? (
                  <div className="mt-1 space-y-1 pl-3">
                    {adminNavItems.map((it) => {
                      const Icon = it.icon;
                      const active = isSettingsActive && settingsTab === it.tab;
                      return (
                        <Link
                          key={it.tab}
                          to={`/settings?tab=${encodeURIComponent(it.tab)}`}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm",
                            active
                              ? "bg-sidebar-accent text-sidebar-foreground"
                              : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <Icon size={16} className={active ? "text-primary" : ""} />
                          <span className="truncate">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </nav>

      {/* Language Selector */}
      <div className={cn("border-t border-sidebar-border", isCollapsed ? "px-2 py-2 flex justify-center" : "px-3 py-3")}>
        {isCollapsed ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group p-2.5 rounded-lg bg-sidebar-accent/50 hover:bg-primary/20 border border-sidebar-border hover:border-primary/40 transition-all duration-200">
                <Languages size={18} className="text-sidebar-muted group-hover:text-primary transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="center" sideOffset={8} className="min-w-[160px] bg-popover border border-border shadow-lg rounded-lg p-1">
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setLanguage(lang.code as any)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150",
                    language === lang.code ? "bg-primary/10 text-primary" : "hover:bg-accent"
                  )}
                >
                  <span className="flex-1 font-medium">{lang.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu> : <LanguageSelector variant="sidebar" />}
      </div>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        {user && (
          <div className={cn("p-3 bg-sidebar-accent rounded-lg", isCollapsed && "p-2")}>
            <div className={cn("flex items-start gap-2", isCollapsed ? "flex-col items-center" : "justify-between")}>
              {!isCollapsed ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
                  <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
                  <span className={cn("inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium", ROLE_CONFIG[user.role].color)}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
              ) : (
                <span className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium", ROLE_CONFIG[user.role].color)}>
                  {user.name.charAt(0)}
                </span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "p-2 rounded-lg text-sidebar-muted hover:text-primary hover:bg-primary/10 transition-colors",
                      isCollapsed && "p-1.5"
                    )}
                    aria-label={t.common.actions}
                  >
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="min-w-[160px] bg-popover border border-border shadow-lg rounded-lg p-1">
                  <FeedbackDialog
                    trigger={
                      <DropdownMenuItem
                        onSelect={(event) => event.preventDefault()}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent"
                      >
                        <MessageCircle size={14} className="mr-2" />
                        {t.feedback.reportIssue}
                      </DropdownMenuItem>
                    }
                  />
                  <HelpDialog
                    trigger={
                      <DropdownMenuItem
                        onSelect={(event) => event.preventDefault()}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent"
                      >
                        <LifeBuoy size={14} className="mr-2" />
                        {t.common.help}
                      </DropdownMenuItem>
                    }
                  />

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={() => setIsAccountOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent"
                  >
                    <KeyRound size={14} className="mr-2" />
                    {t.account.myAccount}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 hover:bg-accent">
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

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 text-destructive hover:bg-destructive/10 focus:text-destructive">
                    <LogOut size={14} className="mr-2" />
                    {t.nav.logout}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />
    </aside>;
};
export default Sidebar;
