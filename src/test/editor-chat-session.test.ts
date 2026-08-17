import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('聊天处理共享故事会话契约', () => {
  it('显式 storyId、共享记忆和旧指针只经过一个解析器', () => {
    const page = read('src/pages/Index.tsx');
    expect(page).toContain('useSearchParams');
    expect(page).toContain('resolveEditorStoryId');
    expect(page).toContain("searchParams.get('storyId')");
    expect(page).toContain('setEditorStoryId');
    expect(page).not.toContain('all.filter(s => !s.characterId)');
  });

  it('角色页普通处理进入 Chat，整理和导出仍进入对应故事视图', () => {
    const page = read('src/pages/CharacterPage.tsx');
    expect(page).toContain('buildEditorChatPath');
    expect(page).toContain('buildEditorStoryPath');
    expect(page).toContain('setEditorStoryId(storyId)');
  });

  it('空态和工作态都挂载最近故事栏', () => {
    const page = read('src/pages/Index.tsx');
    expect(page.match(/<RecentStoryBar/g)).toHaveLength(2);
  });
});
