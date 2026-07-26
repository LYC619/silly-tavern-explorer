import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@/types/chat';
import { swipeCount, currentSwipeId, selectSwipe, syncEditedMessage, isOOCMessage } from '@/lib/chat-edit';

const swipeMsg = (): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  content: '候选B',
  rawData: {
    mes: '候选B',
    swipe_id: 1,
    swipes: ['候选A', '候选B', '候选C'],
    swipe_info: [
      { send_date: 1700000000000 },
      { send_date: 1700000100000 },
      { send_date: '2024-11-14 @06h 18m 30s' },
    ],
  },
});

describe('swipe 读取', () => {
  it('swipeCount/currentSwipeId：无 rawData 或无 swipes 时安全缺省', () => {
    expect(swipeCount({ id: 'x', role: 'user', content: 'hi' })).toBe(0);
    expect(currentSwipeId({ id: 'x', role: 'user', content: 'hi' })).toBe(0);
    expect(swipeCount(swipeMsg())).toBe(3);
    expect(currentSwipeId(swipeMsg())).toBe(1);
  });
});

describe('selectSwipe：content/mes/swipe_id 三处同步', () => {
  it('切换候选并从 swipe_info 取时间戳（含 ST 奇葩日期格式）', () => {
    const next = selectSwipe(swipeMsg(), 2);
    expect(next.content).toBe('候选C');
    expect(next.rawData!.mes).toBe('候选C');
    expect(next.rawData!.swipe_id).toBe(2);
    expect(next.timestamp).toBe(new Date(2024, 10, 14, 6, 18, 30).getTime());
  });

  it('swipe_info 缺失时保留原时间戳', () => {
    const msg = swipeMsg();
    msg.timestamp = 123;
    delete msg.rawData!.swipe_info;
    expect(selectSwipe(msg, 0).timestamp).toBe(123);
  });

  it('越界/无候选时原样返回（不炸也不改）', () => {
    const msg = swipeMsg();
    expect(selectSwipe(msg, 3)).toBe(msg);
    expect(selectSwipe(msg, -1)).toBe(msg);
    const plain: ChatMessage = { id: 'p', role: 'assistant', content: 'x', rawData: { mes: 'x' } };
    expect(selectSwipe(plain, 0)).toBe(plain);
  });

  it('不改入参（父组件靠引用相等做 memo）', () => {
    const msg = swipeMsg();
    selectSwipe(msg, 0);
    expect(msg.content).toBe('候选B');
    expect(msg.rawData!.swipes![1]).toBe('候选B');
  });
});

describe('syncEditedMessage：编辑保存同步 mes + swipes[swipe_id]', () => {
  it('有 swipes 时当前候选一起改，其他候选不动', () => {
    const edited = { ...swipeMsg(), content: '改过的B' };
    const next = syncEditedMessage(edited);
    expect(next.rawData!.mes).toBe('改过的B');
    expect(next.rawData!.swipes).toEqual(['候选A', '改过的B', '候选C']);
  });

  it('无 swipes 只同步 mes；无 rawData 原样返回', () => {
    const plain: ChatMessage = { id: 'p', role: 'user', content: '新文本', rawData: { mes: '旧文本' } };
    expect(syncEditedMessage(plain).rawData!.mes).toBe('新文本');
    const bare: ChatMessage = { id: 'b', role: 'user', content: 'x' };
    expect(syncEditedMessage(bare)).toBe(bare);
  });

  it('swipe_id 越界（ST 脏数据）时不越界写 swipes', () => {
    const msg: ChatMessage = {
      id: 'm', role: 'assistant', content: '新',
      rawData: { mes: '旧', swipe_id: 5, swipes: ['a'] },
    };
    const next = syncEditedMessage(msg);
    expect(next.rawData!.mes).toBe('新');
    expect(next.rawData!.swipes).toEqual(['a']);
  });
});

describe('isOOCMessage', () => {
  it('extra.type=comment 判为 OOC，其余不是', () => {
    expect(isOOCMessage({ id: 'a', role: 'system', content: 'x', rawData: { extra: { type: 'comment' } } })).toBe(true);
    expect(isOOCMessage({ id: 'b', role: 'assistant', content: 'x', rawData: { extra: {} } })).toBe(false);
    expect(isOOCMessage({ id: 'c', role: 'assistant', content: 'x' })).toBe(false);
  });
});
