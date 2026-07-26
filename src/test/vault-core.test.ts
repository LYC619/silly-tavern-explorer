import { describe, expect, it } from 'vitest';
import { createMemFs, joinPath, normalizeRelPath, parentDir, baseName } from '@/lib/vault/fs';
import { safeName, ensureUnique } from '@/lib/vault/naming';
import { parseFrontmatter, serializeFrontmatter } from '@/lib/vault/frontmatter';

describe('vault 路径工具', () => {
  it('规整反斜杠与空段', () => {
    expect(normalizeRelPath('角色\\赫敏//档案.json')).toBe('角色/赫敏/档案.json');
    expect(joinPath('角色', '赫敏', '故事/主线')).toBe('角色/赫敏/故事/主线');
    expect(parentDir('角色/赫敏/档案.json')).toBe('角色/赫敏');
    expect(parentDir('档案.json')).toBe('');
    expect(baseName('角色/赫敏/档案.json')).toBe('档案.json');
  });
});

describe('vault 命名', () => {
  it('过滤非法字符并保留中文', () => {
    expect(safeName('赫敏：格兰杰?')).toBe('赫敏：格兰杰_'); // 全角冒号合法
    expect(safeName('a/b\\c:d*e')).toBe('a_b_c_d_e');
    expect(safeName('结尾点...')).toBe('结尾点');
  });
  it('空与保留名回退', () => {
    expect(safeName('///')).toMatch(/^未命名$|^___$/); // 斜杠替换为 _ 不为空
    expect(safeName('')).toBe('未命名');
    expect(safeName('con')).toBe('未命名');
  });
  it('重名追加序号，不区分大小写', () => {
    expect(ensureUnique('赫敏', [])).toBe('赫敏');
    expect(ensureUnique('赫敏', ['赫敏'])).toBe('赫敏·2');
    expect(ensureUnique('Ab', ['ab', 'AB·2'])).toBe('Ab·3');
  });
});

describe('vault frontmatter', () => {
  it('序列化后可无损回读，含嵌套 JSON 与中文', () => {
    const fields = {
      id: 'sum_1',
      title: '总结·卷一',
      volumeNumber: 1,
      autoSaved: false,
      genParams: { model: 'claude', worldbookUids: [1, 2] },
      skip: undefined,
    };
    const text = serializeFrontmatter(fields, '# 正文\n\n第一段');
    const parsed = parseFrontmatter(text);
    expect(parsed.fields.id).toBe('sum_1');
    expect(parsed.fields.title).toBe('总结·卷一');
    expect(parsed.fields.volumeNumber).toBe(1);
    expect(parsed.fields.genParams).toEqual({ model: 'claude', worldbookUids: [1, 2] });
    expect('skip' in parsed.fields).toBe(false);
    expect(parsed.body).toBe('# 正文\n\n第一段');
  });
  it('无 frontmatter 时整篇当正文', () => {
    const parsed = parseFrontmatter('# 直接正文');
    expect(parsed.fields).toEqual({});
    expect(parsed.body).toBe('# 直接正文');
  });
  it('坏行跳过、裸字符串容错、CRLF 容错', () => {
    const text = '---\r\nid: "a"\r\nbroken\r\ntitle: 手改没引号\r\n---\r\n正文';
    const parsed = parseFrontmatter(text);
    expect(parsed.fields.id).toBe('a');
    expect(parsed.fields.title).toBe('手改没引号');
    expect(parsed.body).toBe('正文');
  });
});

describe('vault 内存 FS', () => {
  it('写读删与列目录（目录优先）', async () => {
    const fs = createMemFs();
    await fs.writeText('角色/赫敏/档案.json', '{}');
    await fs.writeBinary('角色/赫敏/卡片.png', 'aGk=');
    await fs.writeText('角色/赫敏/故事/主线/聊天.jsonl', 'l1');
    const entries = await fs.list('角色/赫敏');
    expect(entries.map((e) => e.name)).toEqual(['故事', '卡片.png', '档案.json']);
    expect(entries[0].isDir).toBe(true);
    expect(await fs.readText('角色/赫敏/档案.json')).toBe('{}');
    expect(await fs.readBinary('角色/赫敏/卡片.png')).toBe('aGk=');
    await fs.removeFile('角色/赫敏/档案.json');
    await expect(fs.readText('角色/赫敏/档案.json')).rejects.toThrow();
    expect(await fs.list('不存在')).toEqual([]);
  });
  it('removeEmptyDir 非空不删', async () => {
    const fs = createMemFs();
    await fs.writeText('角色/赫敏/用户的.txt', 'x');
    expect(await fs.removeEmptyDir('角色/赫敏')).toBe(false);
    await fs.removeFile('角色/赫敏/用户的.txt');
    expect(await fs.removeEmptyDir('角色/赫敏')).toBe(true);
  });
  it('目录改名迁移子路径且拒绝覆盖', async () => {
    const fs = createMemFs();
    await fs.writeText('角色/赫敏/档案.json', '{}');
    await fs.writeText('角色/赫敏/故事/主线/聊天.jsonl', 'l1');
    await fs.rename('角色/赫敏', '角色/赫敏·格兰杰');
    expect(await fs.readText('角色/赫敏·格兰杰/故事/主线/聊天.jsonl')).toBe('l1');
    expect((await fs.stat('角色/赫敏')).exists).toBe(false);
    await fs.writeText('角色/另一人/档案.json', '{}');
    await expect(fs.rename('角色/另一人', '角色/赫敏·格兰杰')).rejects.toThrow('拒绝覆盖');
  });
  it('mkdir 后空目录可见可 stat', async () => {
    const fs = createMemFs();
    await fs.mkdir('角色/赫敏/立绘');
    expect((await fs.stat('角色/赫敏/立绘')).isDir).toBe(true);
    const entries = await fs.list('角色/赫敏');
    expect(entries.map((e) => e.name)).toContain('立绘');
  });
});
