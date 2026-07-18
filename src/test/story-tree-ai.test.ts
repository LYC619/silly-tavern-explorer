import { describe, it, expect } from 'vitest';
import {
  buildTreeFillMessages, parseTreeOps, applyTreeOps, floorsToText, describeOps,
  splitContentSections, appendToSection, type TreeOp,
} from '@/lib/story-tree-ai';
import { childrenOf, findById } from '@/lib/story-tree-model';
import type { StoryNode } from '@/types/story-tree';
import type { ChatSession } from '@/types/chat';

const emptyNodes: StoryNode[] = [];

function node(id: string, parentId: string | null, title: string, order = 0, content = ''): StoryNode {
  return { id, parentId, title, hint: '', content, tags: [], pinned: false, archived: false, order };
}

describe('buildTreeFillMessages', () => {
  it('含现有树大纲与聊天文本，system 要求 JSON ops', () => {
    const nodes = [node('A', null, '角色', 0)];
    const msgs = buildTreeFillMessages(nodes, '爱丽丝: 你好', '只关注关系');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('ops');
    expect(msgs[1].content).toContain('- 角色');
    expect(msgs[1].content).toContain('爱丽丝: 你好');
    expect(msgs[1].content).toContain('只关注关系');
  });
  it('空树显示占位', () => {
    const msgs = buildTreeFillMessages(emptyNodes, '内容');
    expect(msgs[1].content).toContain('当前树为空');
  });
});

describe('parseTreeOps', () => {
  it('解析纯 JSON', () => {
    const ops = parseTreeOps('{"ops":[{"op":"insert","title":"X"}]}');
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('insert');
  });
  it('去 markdown 围栏', () => {
    const ops = parseTreeOps('```json\n{"ops":[{"op":"archive","path":"a"}]}\n```');
    expect(ops[0].op).toBe('archive');
  });
  it('前后有杂物时截取 JSON', () => {
    const ops = parseTreeOps('好的，这是结果：{"ops":[{"op":"update","path":"a","content":"c"}]} 完成');
    expect(ops).toHaveLength(1);
  });
  it('非法 JSON 返回空数组', () => {
    expect(parseTreeOps('not json')).toEqual([]);
    expect(parseTreeOps('{"ops": not-array}')).toEqual([]);
  });
});

describe('applyTreeOps', () => {
  it('insert 自动建父类目', () => {
    const ops: TreeOp[] = [{ op: 'insert', parent: '角色', title: '爱丽丝', content: '主角' }];
    const r = applyTreeOps(emptyNodes, ops);
    expect(r.inserted).toBe(1);
    // 建了「角色」父 + 「爱丽丝」子
    const roots = childrenOf(r.nodes, null);
    expect(roots).toHaveLength(1);
    expect(roots[0].title).toBe('角色');
    const kids = childrenOf(r.nodes, roots[0].id);
    expect(kids[0].title).toBe('爱丽丝');
    expect(kids[0].content).toBe('主角');
  });

  it('同名 insert 合并而非重复（幂等）', () => {
    const start = [node('A', null, '角色', 0), node('A1', 'A', '爱丽丝', 0, '原有')];
    const ops: TreeOp[] = [{ op: 'insert', parent: '角色', title: '爱丽丝', content: '新增事实', keywords: '主角' }];
    const r = applyTreeOps(start, ops);
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(1);
    const n = findById(r.nodes, 'A1')!;
    expect(n.content).toBe('原有\n新增事实'); // 追加
    expect(n.tags).toContain('主角');
    // 没有重复节点
    expect(childrenOf(r.nodes, 'A')).toHaveLength(1);
  });

  it('update 追加正文 + 标签并集', () => {
    const start = [node('A', null, '角色', 0), node('A1', 'A', '爱丽丝', 0, '旧')];
    const ops: TreeOp[] = [{ op: 'update', path: '角色/爱丽丝', content: '新', keywords: ['x', 'y'] }];
    const r = applyTreeOps(start, ops);
    expect(findById(r.nodes, 'A1')!.content).toBe('旧\n新');
    expect(findById(r.nodes, 'A1')!.tags.sort()).toEqual(['x', 'y']);
  });

  it('archive 置 archived', () => {
    const start = [node('A', null, '事件', 0), node('A1', 'A', '旧设定', 0)];
    const r = applyTreeOps(start, [{ op: 'archive', path: '事件/旧设定' }]);
    expect(r.archived).toBe(1);
    expect(findById(r.nodes, 'A1')!.archived).toBe(true);
  });

  it('path 找不到时跳过而非崩', () => {
    const r = applyTreeOps(emptyNodes, [{ op: 'update', path: '不存在/节点', content: 'x' }]);
    expect(r.skipped).toBe(1);
    expect(r.nodes).toEqual([]);
  });

  it('insert 无 title 跳过', () => {
    const r = applyTreeOps(emptyNodes, [{ op: 'insert', parent: '角色' }]);
    expect(r.skipped).toBe(1);
  });

  it('不改入参', () => {
    const start = [node('A', null, '角色', 0)];
    applyTreeOps(start, [{ op: 'insert', parent: '角色', title: 'X' }]);
    expect(start).toHaveLength(1);
  });

  it('带 sectionLabel：insert 正文进 `## 卷` 小节，update 追加到同卷小节', () => {
    // 第一卷生成：新节点正文带小节标题
    const r1 = applyTreeOps(emptyNodes, [
      { op: 'insert', parent: '角色', title: '爱丽丝', content: '初登场，见习骑士' },
    ], { sectionLabel: '第1卷 · 楼层 0~49' });
    const alice1 = childrenOf(r1.nodes, childrenOf(r1.nodes, null)[0].id)[0];
    expect(alice1.content).toBe('## 第1卷 · 楼层 0~49\n初登场，见习骑士');

    // 第二卷生成：update 追加为新的小节
    const r2 = applyTreeOps(r1.nodes, [
      { op: 'update', path: '角色/爱丽丝', content: '晋升正式骑士' },
    ], { sectionLabel: '第2卷 · 楼层 50~99' });
    const alice2 = childrenOf(r2.nodes, childrenOf(r2.nodes, null)[0].id)[0];
    expect(alice2.content).toBe(
      '## 第1卷 · 楼层 0~49\n初登场，见习骑士\n\n## 第2卷 · 楼层 50~99\n晋升正式骑士'
    );

    // 同卷重复生成：并入已有小节，不新建重复标题
    const r3 = applyTreeOps(r2.nodes, [
      { op: 'update', path: '角色/爱丽丝', content: '获得佩剑' },
    ], { sectionLabel: '第2卷 · 楼层 50~99' });
    const alice3 = childrenOf(r3.nodes, childrenOf(r3.nodes, null)[0].id)[0];
    expect(alice3.content).toContain('## 第2卷 · 楼层 50~99\n晋升正式骑士\n获得佩剑');
    expect(alice3.content.match(/## 第2卷/g)).toHaveLength(1);
  });

  it('无 sectionLabel 保持旧行为（直接换行追加）', () => {
    const start = [node('A', null, '角色', 0), node('A1', 'A', '爱丽丝', 0, '原有')];
    const r = applyTreeOps(start, [{ op: 'update', path: '角色/爱丽丝', content: '新增' }]);
    expect(findById(r.nodes, 'A1')!.content).toBe('原有\n新增');
  });
});

describe('splitContentSections / appendToSection', () => {
  it('无小节标题 → 单段 label:null', () => {
    expect(splitContentSections('普通正文')).toEqual([{ label: null, body: '普通正文' }]);
  });
  it('引言 + 多小节切分', () => {
    const s = splitContentSections('引言\n## 第1卷\n甲\n乙\n## 第2卷\n丙');
    expect(s).toEqual([
      { label: null, body: '引言' },
      { label: '第1卷', body: '甲\n乙' },
      { label: '第2卷', body: '丙' },
    ]);
  });
  it('appendToSection：空正文 + label 直接建段；空 addition 原样返回', () => {
    expect(appendToSection('', '第1卷', '事实')).toBe('## 第1卷\n事实');
    expect(appendToSection('原文', '第1卷', '  ')).toBe('原文');
  });
});

describe('floorsToText', () => {
  const session: ChatSession = {
    id: 's', title: 't', character: { name: '爱丽丝' }, user: { name: '我' }, createdAt: 0,
    messages: [
      { id: '0', role: 'user', content: '你好', is_user: true },
      { id: '1', role: 'assistant', content: '你好呀' },
      { id: '2', role: 'user', content: '再见', is_user: true },
    ],
  };
  it('楼层区间转带说话人前缀的文本', () => {
    expect(floorsToText(session, 0, 1)).toBe('我: 你好\n\n爱丽丝: 你好呀');
  });
  it('区间截取', () => {
    expect(floorsToText(session, 2, 2)).toBe('我: 再见');
  });
});

describe('describeOps', () => {
  it('渲染人类可读摘要', () => {
    const lines = describeOps([
      { op: 'insert', parent: '角色', title: '爱丽丝' },
      { op: 'update', path: '角色/鲍勃' },
      { op: 'archive', path: '事件/旧' },
    ]);
    expect(lines[0]).toContain('新增');
    expect(lines[0]).toContain('角色/爱丽丝');
    expect(lines[1]).toContain('更新');
    expect(lines[2]).toContain('归档');
  });
});

describe('applyTreeOps 节点类型', () => {
  it('insert 合法 type 落到节点、非法 type 忽略', () => {
    const r = applyTreeOps([], [
      { op: 'insert', parent: '角色', title: '爱丽丝', type: 'character' },
      { op: 'insert', parent: '角色', title: '鲍勃', type: 'dragon' },
    ]);
    const alice = r.nodes.find((n) => n.title === '爱丽丝');
    const bob = r.nodes.find((n) => n.title === '鲍勃');
    expect(alice?.type).toBe('character');
    expect(bob?.type).toBeUndefined();
  });
});
