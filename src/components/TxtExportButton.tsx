import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatSession, ExportSettings } from '@/types/chat';
import { convertMessagesToTxt } from '@/lib/regex-processor';

interface TxtExportButtonProps {
  session: ChatSession;
  settings: ExportSettings;
}

export function TxtExportButton({ session, settings }: TxtExportButtonProps) {
  const handleExport = () => {
    const txtContent = convertMessagesToTxt(
      session.messages,
      settings.regexRules,
      settings.prefixMode
    );

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <FileText className="w-4 h-4 mr-2" />
      导出 TXT
    </Button>
  );
}
