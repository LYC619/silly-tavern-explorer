import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import type { ChatSession } from '@/types/chat';
import { demoSession } from '@/lib/demo-session';

interface DemoDataProps {
  onLoad: (session: ChatSession) => void;
}

// 示例故事树已随故事树页并入故事工作区（2.0 阶段3）移除——工作区内故事树不再需要空态引导锚点。

export function DemoData({ onLoad }: DemoDataProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onLoad(demoSession)}
      className="gap-2"
    >
      <Wand2 className="w-4 h-4" />
      加载示例
    </Button>
  );
}
