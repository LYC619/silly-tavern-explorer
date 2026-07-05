import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import type { ChatSession } from '@/types/chat';
import type { StoryTree } from '@/types/story-tree';

interface DemoDataProps {
  onLoad: (session: ChatSession) => void;
}

export const demoSession: ChatSession = {
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

/**
 * 示例故事树：与示例会话同题材。仅内存展示（不写 IndexedDB），
 * 供故事树页空态时保证新手引导锚点存在。
 */
export const demoStoryTree: StoryTree = {
  id: 'demo-story-tree',
  bookId: null,
  bookTitle: '月下花园的邂逅',
  title: '月下花园 · 示例树',
  nodes: [
    { id: 'demo-n1', parentId: null, title: '人物', hint: '', content: '', tags: [], pinned: false, archived: false, order: 0 },
    { id: 'demo-n2', parentId: 'demo-n1', title: '樱', hint: '百年樱树下的神秘少女', content: '在庭院百年老樱下赏月的少女，与树同名。喜欢有人来欣赏樱花，说话温柔。', tags: ['主角'], pinned: false, archived: false, order: 0 },
    { id: 'demo-n3', parentId: 'demo-n1', title: '旅人', hint: '被景色吸引的过客', content: '偶然造访庭院的旅人，与樱在月下相识、互通姓名。', tags: [], pinned: false, archived: false, order: 1 },
    { id: 'demo-n4', parentId: null, title: '地点', hint: '', content: '', tags: [], pinned: false, archived: false, order: 1 },
    { id: 'demo-n5', parentId: 'demo-n4', title: '月下庭院', hint: '百年老樱所在', content: '青石板铺地的庭院，月光下樱花如云似雾，花瓣像会发光。', tags: [], pinned: false, archived: false, order: 0 },
    { id: 'demo-n6', parentId: null, title: '事件', hint: '', content: '', tags: [], pinned: false, archived: false, order: 2 },
    { id: 'demo-n7', parentId: 'demo-n6', title: '月下初遇', hint: '第 1-7 楼', content: '旅人被樱花吸引来到庭院，与樱交谈并接过她递来的花瓣，两人互通姓名。', tags: ['起点'], pinned: false, archived: false, order: 0 },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
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
