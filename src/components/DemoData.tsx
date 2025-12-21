import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import type { ChatSession } from '@/types/chat';

interface DemoDataProps {
  onLoad: (session: ChatSession) => void;
}

const demoSession: ChatSession = {
  id: 'demo-1',
  title: '月下花园的邂逅',
  messages: [
    {
      id: '1',
      role: 'assistant',
      content: '月光如水般倾洒在庭院的青石板上，我独自坐在那株百年老樱下，看着花瓣随风飘落。听到脚步声，我微微抬起头，看到了你。',
      name: '樱',
      timestamp: Date.now() - 300000,
    },
    {
      id: '2',
      role: 'user',
      content: '抱歉打扰了，我只是被这里的景色吸引。这棵樱花树真美。',
      name: '旅人',
      timestamp: Date.now() - 280000,
    },
    {
      id: '3',
      role: 'assistant',
      content: '我轻轻摇了摇头，嘴角浮现一抹淡淡的笑意。「不必道歉。这棵树已经在这里守候了很久，它喜欢有人来欣赏它的美。」我拍了拍身边的空位，「要坐下来吗？」',
      name: '樱',
      timestamp: Date.now() - 260000,
    },
    {
      id: '4',
      role: 'user',
      content: '我走过去坐下，仰头看着头顶如云似雾的花海。「你经常来这里吗？」',
      name: '旅人',
      timestamp: Date.now() - 240000,
    },
    {
      id: '5',
      role: 'assistant',
      content: '「每个有月亮的夜晚。」我望向天边那轮明月，眼中映出皎洁的光芒。「在月光下，这些花瓣像是会发光一样，你不觉得吗？」一片花瓣恰好飘落在我的掌心，我将它轻轻递向你。',
      name: '樱',
      timestamp: Date.now() - 220000,
    },
    {
      id: '6',
      role: 'user',
      content: '我接过那片花瓣，指尖触碰到它柔软的质感。「确实很美。」我看向身边的你，「能告诉我你的名字吗？」',
      name: '旅人',
      timestamp: Date.now() - 200000,
    },
    {
      id: '7',
      role: 'assistant',
      content: '我微微侧首，目光与你相遇。月光在我们之间流淌，仿佛时间都静止了。「樱。」我轻声说道，「就像这棵树一样的名字。而你，是从哪里来的旅人？」',
      name: '樱',
      timestamp: Date.now() - 180000,
    },
  ],
  character: {
    name: '樱',
    color: '#C48B9F',
  },
  user: {
    name: '旅人',
    color: '#5B8FA8',
  },
  createdAt: Date.now(),
};

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
