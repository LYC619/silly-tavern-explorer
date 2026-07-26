import { describe, it, expect } from 'vitest';
import type { ChatMessage, ChatSession } from '@/types/chat';
import { mergeReimport, STE_EDIT_SWIPE_FLAG } from '@/lib/adapters/st/reimport-merge';

let seq = 0;
const msg = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `id_${++seq}`,
  role: 'assistant',
  content,
  rawData: { mes: content },
  ...extra,
});

const session = (messages: ChatMessage[], extra: Partial<ChatSession> = {}): ChatSession => ({
  id: 's1',
  title: '我的故事',
  messages,
  character: { name: '赫敏' },
  user: { name: '我' },
  createdAt: 1700000000000,
  ...extra,
});

describe('mergeReimport：无变化与纯追加', () => {
  it('两边一致：changed=false，原 session 引用原样返回', () => {
    const cur = session([msg('a'), msg('b')]);
    const imp = { messages: [msg('a'), msg('b')] };
    const r = mergeReimport(cur, imp);
    expect(r.changed).toBe(false);
    expect(r.session).toBe(cur);
    expect(r.summary).toBe('与导入文件一致，没有变化');
  });

  it('新楼直接追加：楼层内容一致的旧楼保留 STE 侧对象（id/hidden 等不动）', () => {
    const curMsgs = [msg('a'), msg('b')];
    const cur = session(curMsgs);
    const added = [msg('c'), msg('d')];
    const r = mergeReimport(cur, { messages: [msg('a'), msg('b'), ...added] });
    expect(r.changed).toBe(true);
    expect(r.added).toBe(2);
    expect(r.session.messages).toHaveLength(4);
    expect(r.session.messages[0]).toBe(curMsgs[0]);
    expect(r.session.messages[1]).toBe(curMsgs[1]);
    expect(r.session.messages[2].content).toBe('c');
    expect(r.summary).toBe('新增 2 楼');
  });

  it('标题与角色名保留 STE 侧（用户可能已改名）', () => {
    const cur = session([msg('a')]);
    const r = mergeReimport(cur, { messages: [msg('a'), msg('b')] });
    expect(r.session.title).toBe('我的故事');
    expect(r.session.character.name).toBe('赫敏');
  });
});

describe('mergeReimport：冲突楼（ST 版当正文，STE 版转 swipe）', () => {
  it('无候选池的楼：以 ST 正文起池，STE 版追加并标「STE 编辑版」，消息 id 保留 STE 侧', () => {
    const steFloor = msg('STE 里改过的文本', { rawData: { mes: 'STE 里改过的文本', send_date: 111 } });
    const cur = session([msg('a'), steFloor]);
    const stFloor = msg('ST 里的新版文本');
    const r = mergeReimport(cur, { messages: [msg('a'), stFloor] });

    expect(r.conflicted).toBe(1);
    expect(r.swipesAdded).toBe(1);
    const m = r.session.messages[1];
    expect(m.id).toBe(steFloor.id); // 章节/收藏按 messageId 锚定，必须保留
    expect(m.content).toBe('ST 里的新版文本'); // ST 版当正文
    expect(m.rawData!.swipes).toEqual(['ST 里的新版文本', 'STE 里改过的文本']);
    expect(m.rawData!.swipe_id).toBe(0);
    expect(m.rawData!.swipe_info![1].extra[STE_EDIT_SWIPE_FLAG]).toBe(true);
    expect(m.rawData!.swipe_info![1].send_date).toBe(111);
    expect(r.summary).toBe('1 楼有改动已存为 swipe');
  });

  it('已有候选池的楼：STE 版追加到末尾，swipe_id 保持 ST 的选中，swipe_info 补齐对位', () => {
    const cur = session([msg('我改的文本')]);
    const stFloor = msg('候选B', {
      rawData: { mes: '候选B', swipe_id: 1, swipes: ['候选A', '候选B'] }, // 无 swipe_info：边界
    });
    const r = mergeReimport(cur, { messages: [stFloor] });
    const m = r.session.messages[0];
    expect(m.rawData!.swipes).toEqual(['候选A', '候选B', '我改的文本']);
    expect(m.rawData!.swipe_id).toBe(1); // 正文仍是 ST 当前选中
    expect(m.content).toBe('候选B');
    expect(m.rawData!.swipe_info).toHaveLength(3); // 缺失的 swipe_info 补齐到对位
    expect(m.rawData!.swipe_info![2].extra[STE_EDIT_SWIPE_FLAG]).toBe(true);
  });

  it('STE 正文本来就在候选池里（只是切了 swipe）：不重复存，保留 STE 选中', () => {
    const steFloor = msg('候选A', { timestamp: 555, rawData: { mes: '候选A', swipe_id: 0, swipes: ['候选A', '候选B'] } });
    const cur = session([steFloor]);
    const stFloor = msg('候选B', { rawData: { mes: '候选B', swipe_id: 1, swipes: ['候选A', '候选B', '候选C'] } });
    const r = mergeReimport(cur, { messages: [stFloor] });
    const m = r.session.messages[0];
    expect(r.swipesAdded).toBe(0);
    expect(r.conflicted).toBe(1);
    expect(m.rawData!.swipes).toEqual(['候选A', '候选B', '候选C']); // 池以 ST 为准（拿到新候选C）
    expect(m.rawData!.swipe_id).toBe(0); // 但选中保留 STE 的
    expect(m.content).toBe('候选A');
    expect(m.timestamp).toBe(555);
    expect(m.id).toBe(steFloor.id);
    expect(r.summary).toBe('1 楼候选池已更新');
  });

  it('不改入参（合并失败/放弃时原数据完好）', () => {
    const stRaw = { mes: '候选B', swipe_id: 1, swipes: ['候选A', '候选B'] };
    const cur = session([msg('我改的文本')]);
    mergeReimport(cur, { messages: [msg('候选B', { rawData: stRaw })] });
    expect(stRaw.swipes).toEqual(['候选A', '候选B']);
    expect(cur.messages[0].content).toBe('我改的文本');
  });
});

describe('mergeReimport：短文件与元数据', () => {
  it('导入比现有短：STE 独有楼保留，永不删楼', () => {
    const curMsgs = [msg('a'), msg('b'), msg('c')];
    const cur = session(curMsgs);
    const r = mergeReimport(cur, { messages: [msg('a')] });
    expect(r.keptExtra).toBe(2);
    expect(r.changed).toBe(false); // 没新东西也没冲突 = 不落库
    expect(r.summary).toBe('STE 独有 2 楼已保留');
  });

  it('导入短但有冲突：合并后 STE 独有楼仍在原位', () => {
    const curMsgs = [msg('旧a'), msg('b'), msg('c')];
    const cur = session(curMsgs);
    const r = mergeReimport(cur, { messages: [msg('新a')] });
    expect(r.session.messages.map((m) => m.content)).toEqual(['新a', 'b', 'c']);
    expect(r.session.messages[1]).toBe(curMsgs[1]);
    expect(r.summary).toBe('1 楼有改动已存为 swipe，STE 独有 2 楼已保留');
  });

  it('元数据以导入文件为准刷新；仅元数据变化也算 changed', () => {
    const cur = session([msg('a')], { rawMetadata: { user_name: '我', chat_metadata: { note: 1 } } });
    const r = mergeReimport(cur, {
      messages: [msg('a')],
      metadata: { user_name: '我', chat_metadata: { note: 2 } },
    });
    expect(r.changed).toBe(true);
    expect(r.session.rawMetadata!.chat_metadata!.note).toBe(2);
    expect(r.summary).toBe('楼层一致，已刷新元数据');
  });

  it('导入无元数据行时保留现有元数据', () => {
    const meta = { user_name: '我' };
    const cur = session([msg('a')], { rawMetadata: meta });
    const r = mergeReimport(cur, { messages: [msg('a'), msg('b')] });
    expect(r.session.rawMetadata).toBe(meta);
  });
});
