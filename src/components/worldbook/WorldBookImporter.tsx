import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseWorldBook, type WorldBook } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onImport: (wb: WorldBook, filename: string) => void;
}

export function WorldBookImporter({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const wb = parseWorldBook(json);
      const count = Object.keys(wb.entries).length;

      if (count === 0) {
        toast({ title: '导入失败', description: '未找到任何世界书条目', variant: 'destructive' });
        return;
      }

      const name = file.name.replace(/\.json$/i, '');
      onImport(wb, name);
      toast({ title: '导入成功', description: `已加载 ${count} 个条目` });
    } catch {
      toast({ title: '导入失败', description: '无法解析 JSON 文件', variant: 'destructive' });
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="w-4 h-4 mr-2" />
        导入世界书
      </Button>
    </>
  );
}
