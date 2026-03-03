import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/i18n/translations';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LanguageSelectorProps {
  variant?: 'default' | 'sidebar';
  className?: string;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  variant = 'default',
  className 
}) => {
  const { language, setLanguage, t } = useLanguage();

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: t.common.languageEnglish },
    { code: 'fr', label: t.common.languageFrench },
    { code: 'zh', label: t.common.languageChinese },
  ];

  const currentLang = languages.find(l => l.code === language);

  if (variant === 'sidebar') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200",
              "bg-sidebar-accent/50 hover:bg-primary/20 border border-sidebar-border hover:border-primary/40",
              "text-sidebar-foreground",
              className
            )}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Globe size={16} className="text-primary" />
            </div>
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span className="text-xs text-sidebar-muted">{t.auth.selectLanguage}</span>
              <span className="text-sm font-medium truncate">{currentLang?.label}</span>
            </div>
            <svg 
              className="w-4 h-4 text-sidebar-muted group-hover:text-primary transition-colors" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="start" 
          side="right"
          sideOffset={8}
          className="min-w-[180px] bg-popover border border-border shadow-lg rounded-lg p-1"
        >
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150",
                language === lang.code 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-accent"
              )}
            >
              <span className="flex-1 font-medium">{lang.label}</span>
              {language === lang.code && (
                <Check size={16} className="text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors border",
            "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            className
          )}
        >
          <Globe size={16} />
          <span>{currentLang?.code.toUpperCase()}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] bg-popover border border-border shadow-lg rounded-lg p-1">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all duration-150",
              language === lang.code 
                ? "bg-primary/10 text-primary" 
                : "hover:bg-accent"
            )}
          >
            <span className="flex-1 font-medium">{lang.label}</span>
            {language === lang.code && (
              <Check size={16} className="text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;
