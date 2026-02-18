import React from "react";
import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InfoTipProps = {
  text: React.ReactNode;
  className?: string;
};

const InfoTip: React.FC<InfoTipProps> = ({ text, className }) => {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Info"
          className={
            className ??
            "inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          }
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
};

export default InfoTip;

