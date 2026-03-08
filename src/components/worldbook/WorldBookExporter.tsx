import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorldBook } from '@/types/worldbook';
import { exportWorldBook } from '@/types/worldbook';

interface Props {
  worldbook: WorldBook;
  filename?: string;
}

export function WorldBookExporter({ worldbook, filename = 'worldbook' }: Props) {
  const handleExport = () => {
    const json = exportWorldBook(worldbook);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="w-4 h-4 mr-2" />
      导出世界书
    </Button>
  );
}
