import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HelpCardProps {
  children: React.ReactNode;
}

export function HelpCard({ children }: HelpCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="inline-flex flex-col">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setOpen(!open)}
        title="帮助说明"
      >
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
      </Button>
      {open && (
        <div className="mt-2 p-3 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground leading-relaxed animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
