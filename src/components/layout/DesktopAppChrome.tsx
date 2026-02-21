import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Command,
  LayoutGrid,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAppShell } from '@/context/AppShellContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/context/RequestContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DesktopAppChromeProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface RouteContext {
  breadcrumb: BreadcrumbItem[];
}

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  requestId: string | null;
  isRead: boolean;
  createdAt: string | null;
  readAt: string | null;
}

const formatTimeShort = (value?: Date | string | null) => {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatNotificationTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const routeContext = (pathname: string): RouteContext => {
  if (pathname.startsWith('/dashboard')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Dashboard' },
      ],
    };
  }
  if (pathname.startsWith('/requests/new')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Request', to: '/dashboard' },
        { label: 'New' },
      ],
    };
  }
  if (pathname.startsWith('/requests/')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Request', to: '/dashboard' },
        { label: 'Detail' },
      ],
    };
  }
  if (pathname.startsWith('/performance')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Performance' },
      ],
    };
  }
  if (pathname.startsWith('/price-list')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Price List' },
      ],
    };
  }
  if (pathname.startsWith('/settings')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: 'Admin Settings' },
      ],
    };
  }
  return {
    breadcrumb: [
      { label: 'CRA', to: '/dashboard' },
      { label: 'Workspace' },
    ],
  };
};

const isTypingElement = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const DesktopAppChrome: React.FC<DesktopAppChromeProps> = ({ sidebarCollapsed, onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    density,
    setDensity,
    globalSearchQuery,
    setGlobalSearchQuery,
    commandPaletteOpen,
    setCommandPaletteOpen,
    searchResults,
    isSearchLoading,
    shellStatus,
    shellStatusError,
    refreshShellStatus,
    saveState,
  } = useAppShell();
  const { refreshRequests, lastSyncAt, syncState, syncError } = useRequests();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsFilter, setNotificationsFilter] = useState<'unread' | 'all'>('unread');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const context = useMemo(() => routeContext(location.pathname), [location.pathname]);

  const navigationCommands = useMemo(
    () => [
      { id: 'go-dashboard', label: 'Go to Dashboard', path: '/dashboard', icon: LayoutGrid },
      { id: 'go-new-request', label: 'New Request', path: '/requests/new', icon: Plus },
      { id: 'go-settings', label: 'Go to Settings', path: '/settings', icon: Settings },
    ],
    []
  );

  const utilityCommands = useMemo(
    () => [
      {
        id: 'refresh-all',
        label: 'Refresh data',
        run: async () => {
          await Promise.all([refreshRequests(), refreshShellStatus()]);
          toast.success('Data refreshed');
        },
      },
      {
        id: 'toggle-density',
        label: density === 'compact' ? 'Switch to comfortable density' : 'Switch to compact density',
        run: async () => {
          setDensity(density === 'compact' ? 'comfortable' : 'compact');
        },
      },
    ],
    [density, refreshRequests, refreshShellStatus, setDensity]
  );

  const filteredPaletteRequests = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return searchResults.slice(0, 8);
    return searchResults
      .filter((item) =>
        [item.id, item.clientName, item.applicationVehicle, item.country].some((value) =>
          String(value ?? '').toLowerCase().includes(q)
        )
      )
      .slice(0, 8);
  }, [paletteQuery, searchResults]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteQuery(globalSearchQuery);
        setCommandPaletteOpen(true);
        return;
      }

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingElement(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingElement(event.target)) {
        event.preventDefault();
        navigate('/requests/new');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [globalSearchQuery, navigate, setCommandPaletteOpen]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      setUnreadCount(Number(data?.unreadCount ?? 0) || 0);
    } catch {
      // ignore transient polling errors
    }
  }, [user]);

  const fetchNotifications = useCallback(
    async (filter: 'unread' | 'all') => {
      if (!user) {
        setNotifications([]);
        return;
      }
      setNotificationsLoading(true);
      setNotificationsError(null);
      try {
        const unreadOnly = filter === 'unread';
        const res = await fetch(`/api/notifications?limit=50&unreadOnly=${unreadOnly ? 'true' : 'false'}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json().catch(() => null);
        const items = Array.isArray(data?.items) ? (data.items as AppNotification[]) : [];
        setNotifications(items);
      } catch (error) {
        setNotificationsError(String((error as any)?.message ?? error));
      } finally {
        setNotificationsLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!notificationsOpen) return;
    fetchNotifications(notificationsFilter);
  }, [fetchNotifications, notificationsFilter, notificationsOpen]);

  useEffect(() => {
    let timerId: number | undefined;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      await fetchUnreadCount();
      if (notificationsOpen) {
        await fetchNotifications(notificationsFilter);
      }
    };

    void tick();
    timerId = window.setInterval(tick, 20_000);

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
  }, [fetchNotifications, fetchUnreadCount, notificationsFilter, notificationsOpen]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshRequests(), refreshShellStatus()]);
      toast.success('Data refreshed');
    } catch {
      toast.error('Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });
      if (!res.ok) return;
      setNotifications((prev) => prev.filter((item) => (notificationsFilter === 'unread' ? item.id !== notificationId : true)).map((item) => (
        item.id === notificationId ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() } : item
      )));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) return;
      setUnreadCount(0);
      setNotifications((prev) => (notificationsFilter === 'unread' ? [] : prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }))));
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleOpenNotification = async (item: AppNotification) => {
    if (!item.isRead) {
      await handleMarkRead(item.id);
    }
    if (item.requestId) {
      navigate(`/requests/${item.requestId}`);
      setNotificationsOpen(false);
    }
  };

  return (
    <>
      <div className="hidden md:block fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="h-10 px-4 flex items-center">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/monroc-favicon.png?v=5" alt="ROC" className="h-5 w-5 object-contain" />
            <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">CRA</span>
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">{t.branding.customerRequestAnalysis}</span>
          </div>
        </div>
        <div className="h-12 px-4 border-t border-border/70 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-[220px]">
            {context.breadcrumb.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                {crumb.to && index < context.breadcrumb.length - 1 ? (
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                    onClick={() => navigate(crumb.to as string)}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className={cn(index === context.breadcrumb.length - 1 && 'text-foreground font-medium')}>{crumb.label}</span>
                )}
                {index < context.breadcrumb.length - 1 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="relative w-full max-w-[420px] transition-[max-width] duration-200 ease-out focus-within:max-w-[620px]">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                ref={searchInputRef}
                value={globalSearchQuery}
                onChange={(event) => setGlobalSearchQuery(event.target.value)}
                placeholder="Search request ID / client / country..."
                className="h-8 pl-9 pr-20"
              />
              <button
                type="button"
                onClick={() => {
                  setPaletteQuery(globalSearchQuery);
                  setCommandPaletteOpen(true);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Command className="h-3 w-3" />
                K
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate('/requests/new')}
              aria-label={t.nav.newRequest}
              title={t.nav.newRequest}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() => {
                    setPaletteQuery(globalSearchQuery);
                    setCommandPaletteOpen(true);
                  }}
                >
                  Open command palette
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={density} onValueChange={(value) => setDensity(value as 'compact' | 'comfortable')}>
                  <DropdownMenuRadioItem value="compact">Compact density</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="comfortable">Comfortable density</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="hidden md:flex fixed bottom-0 left-0 right-0 z-50 h-8 px-4 border-t border-border bg-background/95 backdrop-blur items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">DB: {shellStatus?.db?.healthLabel ?? '--'}</span>
          <span className="truncate">Sync: {syncState === 'refreshing' ? 'Refreshing' : syncState === 'error' ? 'Error' : 'Ready'}</span>
          <span className="truncate">Last refresh: {formatTimeShort(lastSyncAt)}</span>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">
            {saveState.kind === 'saving'
              ? 'Saving...'
              : saveState.kind === 'saved'
                ? `Saved ${formatTimeShort(saveState.at)}`
                : saveState.kind === 'error'
                  ? 'Save error'
                  : 'Idle'}
          </span>
          <span className="truncate">User: {user?.name ?? '--'}</span>
          <span className="truncate">Build: {shellStatus?.build?.hash ? shellStatus.build.hash.slice(0, 8) : '--'}</span>
          {syncError ? <span className="text-red-600 truncate">Sync error</span> : null}
          {shellStatusError ? <span className="text-red-600 truncate">Status error</span> : null}
        </div>
      </div>

      <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="border-b border-border p-3">
            <Input
              value={paletteQuery}
              onChange={(event) => {
                const value = event.target.value;
                setPaletteQuery(value);
                setGlobalSearchQuery(value);
              }}
              placeholder="Type a command or search request..."
              className="h-10"
              autoFocus
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto scrollbar-thin p-2 space-y-2">
            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">Navigation</div>
              <div className="space-y-1">
                {navigationCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => {
                      setCommandPaletteOpen(false);
                      navigate(command.path);
                    }}
                    className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent text-left"
                  >
                    <command.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{command.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">Requests</div>
              {isSearchLoading ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">Searching...</div>
              ) : filteredPaletteRequests.length ? (
                <div className="space-y-1">
                  {filteredPaletteRequests.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCommandPaletteOpen(false);
                        navigate(`/requests/${item.id}`);
                      }}
                      className="w-full rounded px-2 py-2 text-left hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.id}</span>
                        <span className="text-xs text-muted-foreground">{item.status}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.clientName} - {item.country}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-2 py-2 text-sm text-muted-foreground">No matching requests.</div>
              )}
            </div>

            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">Utilities</div>
              <div className="space-y-1">
                {utilityCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={async () => {
                      await command.run();
                      setCommandPaletteOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent text-left"
                  >
                    <span>{command.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Ctrl+K command palette | / focus search | N new request</span>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(false)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0">
          <div className="h-full flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-base">Notifications</SheetTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleMarkAllRead} disabled={isMarkingAllRead || unreadCount === 0}>
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    Mark all read
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <Button
                variant={notificationsFilter === 'unread' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setNotificationsFilter('unread')}
              >
                Unread
              </Button>
              <Button
                variant={notificationsFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setNotificationsFilter('all')}
              >
                All
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {notificationsLoading ? <div className="p-3 text-sm text-muted-foreground">Loading notifications...</div> : null}
              {notificationsError ? <div className="p-3 text-sm text-red-600">Failed to load notifications.</div> : null}
              {!notificationsLoading && !notificationsError && notifications.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No notifications.</div>
              ) : null}
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-md border p-2 transition-colors',
                      item.isRead ? 'border-border bg-background' : 'border-primary/30 bg-primary/5'
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void handleOpenNotification(item)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatNotificationTime(item.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.body}</p>
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      {!item.isRead ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => void handleMarkRead(item.id)}
                        >
                          Mark read
                        </Button>
                      ) : null}
                      {item.requestId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            navigate(`/requests/${item.requestId}`);
                            setNotificationsOpen(false);
                          }}
                        >
                          Open request
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DesktopAppChrome;
