import { describe, expect, it } from 'vitest';
import { compareSTText, mergeSTText } from '@/lib/vault/st-update';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';

const META = JSON.stringify({ user_name: 'User', character_name: '赫敏', create_date: '2026-07-26@10h00m00s' });

function mkJsonl(floors: number): string {
  const lines = [META];
  for (let i = 0; i < floors; i++) {
    lines.push(
      JSON.stringify({
        name: i % 2 ? 'User' : '赫敏',
        is_user: i % 2 === 1,
        send_date: `2026-07-26@10h0${i}m00s`,
        mes: `第${i + 1}楼`,
      }),
    );
  }
  return lines.join('\n');
}

function mkStory(floors: number): ArchiveStory {
  const { messages, metadata } = parseJsonl(mkJsonl(floors));
  const session: ChatSession = {
    id: 's1',
    title: '主线',
    messages,
    character: { name: '赫敏' },
    user: { name: 'User' },
    createdAt: 1000,
    rawMetadata: metadata,
  };
  return {
    id: 'astory_1',
    title: '主线',
    session,
    markers: [],
    meta: { modelsUsed: [], playTimeMs: null },
    sourcePath: 'D:/ST/data/default-user/chats/赫敏/主线.jsonl',
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe('检查 ST 更新（7.4）', () => {
  it('ST 端多楼才提示，含差值', () => {
    const s = compareSTText(mkJsonl(4), mkStory(2));
    expect(s).toEqual({ stFloors: 4, steFloors: 2, extraFloors: 2, hasUpdate: true });
  });

  it('同楼数/ST 更少都不提示', () => {
    expect(compareSTText(mkJsonl(2), mkStory(2)).hasUpdate).toBe(false);
    const fewer = compareSTText(mkJsonl(1), mkStory(3));
    expect(fewer.hasUpdate).toBe(false);
    expect(fewer.extraFloors).toBe(0);
  });

  it('mergeSTText 按 4.2 规则追加新楼进主线并记 lastImportedAt', () => {
    const before = Date.now();
    const { story, result } = mergeSTText(mkJsonl(4), mkStory(2));
    expect(result.changed).toBe(true);
    expect(result.added).toBe(2);
    expect(story.session.messages.length).toBe(4);
    expect(story.session.messages[3].content).toBe('第4楼');
    expect(story.lastImportedAt).toBeGreaterThanOrEqual(before);
  });

  it('无变化时 changed=false，调用方不落库', () => {
    const { result } = mergeSTText(mkJsonl(2), mkStory(2));
    expect(result.changed).toBe(false);
    expect(result.added).toBe(0);
  });
});
