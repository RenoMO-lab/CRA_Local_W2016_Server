import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Download,
  KeyRound,
  Laptop,
  Languages,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import AccountDialog from '@/components/account/AccountDialog';
import FeedbackDialog from '@/components/feedback/FeedbackDialog';
import HelpDialog from '@/components/help/HelpDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { ROLE_CONFIG } from '@/types';

type UserHubMenuProps = {
  trigger: React.ReactNode;
  contentAlign?: 'start' | 'center' | 'end';
  contentSide?: 'top' | 'right' | 'bottom' | 'left';
  contentSideOffset?: number;
  contentClassName?: string;
};

const UserHubMenu: React.FC<UserHubMenuProps> = ({
  trigger,
  contentAlign = 'end',
  contentSide = 'bottom',
  contentSideOffset = 8,
  contentClassName,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const roleLabel = useMemo(() => {
    if (!user) return '';
    return t.roles[user.role] || ROLE_CONFIG[user.role].label;
  }, [t.roles, user]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={contentAlign}
          side={contentSide}
          sideOffset={contentSideOffset}
          className={cn('min-w-[250px]', contentClassName)}
        >
          {user ? (
            <>
              <div className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem onSelect={() => setIsAccountOpen(true)}>
            <KeyRound size={14} className="mr-2" />
            {t.account.myAccount}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Laptop size={14} className="mr-2" />
              {t.common.theme}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {[
                { key: 'system', label: t.common.themeSystem, icon: Laptop },
                { key: 'light', label: t.common.themeLight, icon: Sun },
                { key: 'dark', label: t.common.themeDark, icon: Moon },
              ].map((option) => {
                const Icon = option.icon;
                const active = (theme || 'system') === option.key;
                return (
                  <DropdownMenuItem key={option.key} onSelect={() => setTheme(option.key as 'system' | 'light' | 'dark')}>
                    <Icon size={14} className="mr-2" />
                    <span className="flex-1">{option.label}</span>
                    {active ? <Check size={13} className="text-primary" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages size={14} className="mr-2" />
              {t.common.language}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {[
                { code: 'en', label: 'English' },
                { code: 'fr', label: 'Français' },
                { code: 'zh', label: '中文' },
              ].map((item) => {
                const active = language === item.code;
                return (
                  <DropdownMenuItem key={item.code} onSelect={() => setLanguage(item.code as 'en' | 'fr' | 'zh')}>
                    <span className="flex-1">{item.label}</span>
                    {active ? <Check size={13} className="text-primary" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => navigate('/downloads')}>
            <Download size={14} className="mr-2" />
            {t.downloads.downloadButton}
          </DropdownMenuItem>

          <HelpDialog
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <LifeBuoy size={14} className="mr-2" />
                {t.common.help}
              </DropdownMenuItem>
            }
          />

          <DropdownMenuItem
            onSelect={() => {
              window.dispatchEvent(new CustomEvent('feedback:open'));
            }}
          >
            <MessageCircle size={14} className="mr-2" />
            {t.feedback.reportIssue}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
            <LogOut size={14} className="mr-2" />
            {t.nav.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="hidden">
        <FeedbackDialog trigger={<span />} />
      </div>

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />
    </>
  );
};

export default UserHubMenu;
