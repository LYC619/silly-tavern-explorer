/** 简介清洗管道（10.0）：优先级 + 声明类识别 + 不可读过滤 */
import { describe, expect, it } from 'vitest';
import { cleanIntro, isDeclarationText, isUnreadable } from '@/lib/intro-clean';

describe('isDeclarationText', () => {
  it('中英版权声明关键词命中', () => {
    expect(isDeclarationText('禁止转载，禁止商用')).toBe(true);
    expect(isDeclarationText('Do not repost. All rights reserved.')).toBe(true);
    expect(isDeclarationText('她是海边小镇的图书管理员')).toBe(false);
  });
});

describe('isUnreadable', () => {
  it('代码块 / JSON / YAML / 占位符开头 / 英文指令判为不可读', () => {
    expect(isUnreadable('```yaml\nname: test')).toBe(true);
    expect(isUnreadable('{"name":"x"}')).toBe(true);
    expect(isUnreadable('---\nkey: value')).toBe(true);
    expect(isUnreadable('character_details: # YAML configuration required')).toBe(true);
    expect(isUnreadable('{{char}}是一位剑士')).toBe(true);
    expect(isUnreadable('You are a helpful roleplay assistant')).toBe(true);
    expect(isUnreadable('[System note: stay in character]')).toBe(true);
    expect(isUnreadable('<character>设定</character>')).toBe(true);
  });

  it('正常人话不误伤', () => {
    expect(isUnreadable('雨夜的旧书店里，她递来一把伞。')).toBe(false);
    expect(isUnreadable('A quiet librarian in a seaside town.')).toBe(false);
  });
});

describe('cleanIntro 优先级', () => {
  it('creator_notes 可读且非声明 → 直接用', () => {
    expect(cleanIntro({ creator_notes: '一张温柔的日常卡', scenario: '海边小镇' })).toBe('一张温柔的日常卡');
  });

  it('creator_notes 是版权声明 → 降级 scenario', () => {
    expect(cleanIntro({ creator_notes: '禁止转载与商用', scenario: '海边小镇的夏天' })).toBe('海边小镇的夏天');
  });

  it('scenario 不可读 → personality → description 前 100 字', () => {
    const desc = '很'.repeat(150);
    expect(cleanIntro({ scenario: '{{user}} must obey', personality: '', description: desc })).toBe('很'.repeat(100));
  });

  it('描述里的宏替换为角色名/你，空白压缩', () => {
    expect(cleanIntro({ name: '奏枝', description: '奏枝与你相遇。\n\n她叫{{char}}，等待{{user}}。' }))
      .toBe('奏枝与你相遇。 她叫奏枝，等待你。');
  });

  it('全军覆没返回空串', () => {
    expect(cleanIntro({ creator_notes: '禁止转载', description: '```code```' })).toBe('');
    expect(cleanIntro({})).toBe('');
  });
});
