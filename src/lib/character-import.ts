/**
 * 角色页统一导入（10.3c，反馈 2.4：导入弹窗六类）。
 * 每类复用既有解析器入库：故事→archiveStories；世界书/预设/正则→资产库+挂引用；
 * 引用→quotes 字段；立绘→portrait-store；关联文件→attachment-store（0830 条目 6，客户端专有）。
 * 返回逐文件计数 + 待写回角色档案的 patch（assets/quotes/portraitRows/attachments），页面统一 patchCharacter。
 */
import type { ArchiveCharacter, QuoteAsset } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import { parseJsonl, parseJson } from '@/lib/adapters/st';
import { buildStoryFromSession, saveArchiveStory } from '@/lib/archive-db';
import { generateWorldBookId, parseWorldBook, type WorldBook } from '@/types/worldbook';
import { saveWorldBook } from '@/lib/worldbook-db';
import { parsePreset } from '@/lib/preset-parser';
import { generatePresetId } from '@/types/preset';
import { savePreset } from '@/lib/preset-db';
import { parseSTRegexImport } from '@/lib/st-regex-interop';
import { buildRegexCollection, saveRegexCollection } from '@/lib/regex-db';
import { addAssetRef } from '@/lib/asset-cow';
import { addPortraitFiles } from '@/lib/portrait-store';
import { addAttachmentFiles, attachmentsSupported } from '@/lib/attachment-store';

export type CharacterImportKind = 'story' | 'worldbook' | 'preset' | 'regex' | 'quote' | 'portrait' | 'attachment';

/** 七类导入（顺序即弹窗显示顺序；前六类对照设计稿 IMPORT_KINDS，附件是 0830 条目 6 加的） */
export const IMPORT_KINDS: { kind: CharacterImportKind; label: string; desc: string; accept: string }[] = [
  { kind: 'story', label: '故事记录', desc: 'SillyTavern 的 .jsonl 聊天记录', accept: '.jsonl,.json' },
  { kind: 'worldbook', label: '世界书', desc: 'lorebook / world info 的 .json', accept: '.json' },
  { kind: 'preset', label: '预设', desc: '采样参数与提示词预设', accept: '.json' },
  { kind: 'regex', label: '正则', desc: '显示层的替换规则', accept: '.json' },
  { kind: 'quote', label: '引用', desc: '摘录、语料片段（.txt / .md，或直接粘贴）', accept: '.txt,.md' },
  { kind: 'portrait', label: '立绘 / 卡面', desc: 'png / jpg / webp，可设为当前卡面', accept: 'image/png,image/jpeg,image/webp,image/gif' },
  // accept 不限类型：这一栏收的就是「其他六类装不下的东西」（客户端专有）
  { kind: 'attachment', label: '关联文件', desc: '发布页存的 html、同人视频等任意文件（仅客户端）', accept: '' },
];

export interface CharacterImportResult {
  ok: number;
  fail: number;
  /** 待并入角色档案的变更；无则 undefined */
  patch?: Partial<ArchiveCharacter>;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '');

export function requireNonEmptyWorldBook(worldbook: WorldBook): WorldBook {
  if (Object.keys(worldbook.entries).length === 0) {
    throw new Error('文件里没有任何世界书条目');
  }
  return worldbook;
}

/** 聊天文件 → 归档故事（从 CharacterPage 顶栏导入挪来，10.3c 并入六类） */
async function importStoryFile(c: ArchiveCharacter, file: File): Promise<void> {
  const content = await file.text();
  const isJsonl = file.name.endsWith('.jsonl') || content.trim().split('\n').length > 1;
  const { messages, metadata } = isJsonl ? parseJsonl(content) : parseJson(content);
  if (messages.length === 0) throw new Error('empty');
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: stem(file.name),
    messages,
    character: { name: metadata?.character_name || c.name },
    user: { name: metadata?.user_name || 'User' },
    createdAt: Date.now(),
    rawMetadata: metadata,
  };
  await saveArchiveStory(buildStoryFromSession(session, c.id));
}

/** 六类统一入口：解析入库；引用/立绘/资产引用的档案变更通过返回的 patch 落回 */
export async function importFilesForCharacter(
  c: ArchiveCharacter,
  kind: CharacterImportKind,
  files: File[],
): Promise<CharacterImportResult> {
  if (kind === 'portrait') {
    const { patch, ok, fail } = await addPortraitFiles(c, null, files);
    return { ok, fail, patch: ok > 0 ? patch : undefined };
  }

  if (kind === 'attachment') {
    if (!attachmentsSupported()) throw new Error('关联文件需要客户端文件库；网页版无法存放任意文件');
    const { patch, ok, fail } = await addAttachmentFiles(c, files);
    return { ok, fail, patch: ok > 0 ? patch : undefined };
  }

  let ok = 0;
  let fail = 0;
  const initialAssets = c.assets ?? [];
  let assets = initialAssets;
  const quotes: QuoteAsset[] = [];
  for (const file of files) {
    try {
      const now = Date.now();
      switch (kind) {
        case 'story':
          await importStoryFile(c, file);
          break;
        case 'worldbook': {
          const id = generateWorldBookId();
          const worldbook = requireNonEmptyWorldBook(parseWorldBook(JSON.parse(await file.text())));
          await saveWorldBook({
            id, title: stem(file.name), worldbook,
            createdAt: now, updatedAt: now,
          });
          assets = addAssetRef(assets, 'worldbook', id);
          break;
        }
        case 'preset': {
          const id = generatePresetId();
          await savePreset({
            id, title: stem(file.name), preset: parsePreset(JSON.parse(await file.text())),
            createdAt: now, updatedAt: now,
          });
          assets = addAssetRef(assets, 'preset', id);
          break;
        }
        case 'regex': {
          const rules = parseSTRegexImport(JSON.parse(await file.text()));
          if (rules.length === 0) throw new Error('文件里没有正则脚本');
          const item = buildRegexCollection(stem(file.name), rules);
          await saveRegexCollection(item);
          assets = addAssetRef(assets, 'regex', item.id);
          break;
        }
        case 'quote': {
          const body = (await file.text()).trim();
          if (!body) throw new Error('empty');
          quotes.push({ id: crypto.randomUUID(), title: stem(file.name), body, addedAt: now });
          break;
        }
      }
      ok++;
    } catch {
      fail++;
    }
  }

  const patch: Partial<ArchiveCharacter> = {};
  if (assets !== initialAssets) patch.assets = assets;
  if (quotes.length > 0) patch.quotes = [...(c.quotes ?? []), ...quotes];
  return { ok, fail, patch: Object.keys(patch).length > 0 ? patch : undefined };
}
