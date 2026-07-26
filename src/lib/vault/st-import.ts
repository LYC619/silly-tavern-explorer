/**
 * 首次接入 SillyTavern（2.0 阶段7.3，定稿第八章「首次接入 ST」）——纯函数层，无 UI。
 *
 * 流程：指定 ST 目录 → scanSTUserDir 扫描列清单（数量/体积）→ 用户勾选 → importSelected
 * 复制进库并记来源路径（sourcePath），供 7.4 检查更新用。不全量强导。
 *
 * 约束：
 * - 传入的 VaultFs 以「用户所选目录」为根；选的是 ST 安装根目录（含 data/default-user
 *   子目录）时自动下钻，返回的所有相对路径都已带下钻前缀。
 * - 只读 ST 目录，绝不写（备份/写回是 7.5 的事）。目录缺失一律当空组，不抛错。
 * - 重复导入判定：同 sourcePath 的角色/故事/世界书已在库中 → 跳过并计数（skipped）；
 *   解析失败的文件单独计数（failed），两者在汇总里分开，UI 好解释。
 * - 已导入过的角色卡再跑一遍时，其名下新勾选的聊天仍会绑到「已存在的那个角色」上
 *   （按 sourcePath 找回原角色 id），不会产生第二个角色。
 * - 角色卡解析失败（PNG 无 chara/ccv3 块等）时，名下勾选的聊天降级为未绑定故事导入
 *   （进 临时/），聊天数据不因卡坏而丢。
 */
import type { VaultFs } from './fs';
import { joinPath } from './fs';
import { extractCharacterFromPngBuffer } from '@/lib/png-parser';
import {
  buildCharacterFromCard,
  buildStoryFromSession,
  getAllArchiveStories,
  getAllCharacters,
  saveArchiveStory,
  saveCharacter,
} from '@/lib/archive-db';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import { generateWorldBookId, parseWorldBook } from '@/types/worldbook';
import { getAllWorldBooks, saveWorldBook } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import type { ChatSession } from '@/types/chat';

// ---------- 扫描 ----------

export interface STScanChat {
  /** 文件名去 .jsonl（用作故事标题） */
  name: string;
  /** 相对所选目录的路径（含下钻前缀），如 'chats/赫敏/主线.jsonl' */
  path: string;
  size: number;
  /** chats/ 下的分组文件夹名（= ST 里的角色文件名） */
  characterDir: string;
}

export interface STScanCharacter {
  /** PNG 文件名去 .png（= ST 的角色标识） */
  name: string;
  pngPath: string;
  pngSize: number;
  /** 该角色名下的聊天（chats/<角色名>/*.jsonl） */
  chats: STScanChat[];
  /** 聊天总字节（清单显示体积用） */
  chatBytes: number;
}

export interface STScanWorldbook {
  /** 文件名去 .json（ST 世界书名即文件名） */
  name: string;
  path: string;
  size: number;
}

export interface STScanResult {
  /** 实际扫描的用户目录（相对所选根）：直接选中用户目录时为 ''，选安装根时为 'data/default-user' */
  userDir: string;
  characters: STScanCharacter[];
  /** 散聊天：chats/ 下找不到同名角色卡的分组（卡被删/改名过），仍可导入为未绑定故事 */
  strayChats: STScanChat[];
  worldbooks: STScanWorldbook[];
}

/** 列出目录下指定扩展名的文件（目录不存在 = 空数组，VaultFs.list 已保证） */
async function listFiles(fs: VaultFs, dir: string, ext: string): Promise<{ name: string; path: string; size: number }[]> {
  const out: { name: string; path: string; size: number }[] = [];
  for (const e of await fs.list(dir)) {
    if (!e.isDir && e.name.toLowerCase().endsWith(ext)) {
      out.push({ name: e.name.slice(0, -ext.length), path: joinPath(dir, e.name), size: e.size });
    }
  }
  return out;
}

/**
 * 扫描 ST 用户目录，返回结构化清单。
 * fs 以用户所选目录为根；三个子目录（characters/chats/worlds）都不在、
 * 但存在 data/default-user 时视为选中了 ST 安装根目录，自动下钻。
 */
export async function scanSTUserDir(fs: VaultFs): Promise<STScanResult> {
  let userDir = '';
  const hasAny = async (base: string) => {
    for (const d of ['characters', 'chats', 'worlds']) {
      if ((await fs.stat(joinPath(base, d))).isDir) return true;
    }
    return false;
  };
  if (!(await hasAny(''))) {
    const nested = 'data/default-user';
    if ((await fs.stat(nested)).isDir && (await hasAny(nested))) userDir = nested;
  }

  // 角色卡：characters/*.png
  const characters: STScanCharacter[] = (await listFiles(fs, joinPath(userDir, 'characters'), '.png')).map((f) => ({
    name: f.name,
    pngPath: f.path,
    pngSize: f.size,
    chats: [],
    chatBytes: 0,
  }));
  // 聊天按角色归组：chats/<角色名>/*.jsonl；分组名与卡名匹配不区分大小写（Windows 文件系统语义）
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));
  const strayChats: STScanChat[] = [];
  for (const e of await fs.list(joinPath(userDir, 'chats'))) {
    if (!e.isDir) continue;
    const files = await listFiles(fs, joinPath(userDir, 'chats', e.name), '.jsonl');
    const chats: STScanChat[] = files.map((f) => ({ ...f, characterDir: e.name }));
    const owner = byName.get(e.name.toLowerCase());
    if (owner) {
      owner.chats.push(...chats);
      owner.chatBytes += chats.reduce((s, c) => s + c.size, 0);
    } else {
      strayChats.push(...chats);
    }
  }
  // 世界书：worlds/*.json
  const worldbooks: STScanWorldbook[] = await listFiles(fs, joinPath(userDir, 'worlds'), '.json');

  // 码点序（不用 localeCompare：拼音排序依赖 ICU 数据，测试环境间不稳定）
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  characters.sort((a, b) => cmp(a.name, b.name));
  for (const c of characters) c.chats.sort((a, b) => cmp(a.name, b.name));
  strayChats.sort((a, b) => cmp(a.name, b.name));
  worldbooks.sort((a, b) => cmp(a.name, b.name));
  return { userDir, characters, strayChats, worldbooks };
}

// ---------- 导入 ----------

export interface STImportPlan {
  /** 用户所选目录的绝对路径（与 createTauriFs 的 root 一致）；sourcePath = stRoot + '/' + 相对路径 */
  stRoot: string;
  /** 勾选的角色（连带各自勾选的聊天） */
  characters: Array<Pick<STScanCharacter, 'name' | 'pngPath'> & { chats: Array<Pick<STScanChat, 'name' | 'path'>> }>;
  /** 勾选的散聊天 → 未绑定故事（进 临时/） */
  strayChats: Array<Pick<STScanChat, 'name' | 'path'>>;
  worldbooks: Array<Pick<STScanWorldbook, 'name' | 'path'>>;
}

export interface STImportSummary {
  /** 新导入的角色数 */
  characters: number;
  /** 新导入的故事数（含绑定与未绑定） */
  stories: number;
  worldbooks: number;
  /** 同 sourcePath 已在库中 → 跳过 */
  skipped: number;
  /** 文件解析失败 → 跳过（与 skipped 分开，toast 好解释） */
  failed: number;
}

/** ST 绝对来源路径：所选根（去尾部分隔符）+ '/' + 相对路径，与 createTauriFs 实际读的路径一致 */
function sourcePathOf(stRoot: string, rel: string): string {
  return `${stRoot.replace(/[\\/]+$/, '')}/${rel}`;
}

/** base64（无前缀）→ ArrayBuffer，解析 PNG 卡用 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * 按勾选项执行导入。写入走 archive-db / worldbook-db 的保存入口
 * （createRepo 惰性代理：客户端落文件库，vitest 里 setActiveVault(内存库) 即可验证）。
 */
export async function importSelected(stFs: VaultFs, plan: STImportPlan): Promise<STImportSummary> {
  const summary: STImportSummary = { characters: 0, stories: 0, worldbooks: 0, skipped: 0, failed: 0 };

  // 现有库里按 sourcePath 建索引（重复导入判定）
  const charBySource = new Map<string, string>();
  for (const c of await getAllCharacters()) {
    if (c.sourcePath) charBySource.set(c.sourcePath, c.id);
  }
  const storySources = new Set((await getAllArchiveStories()).map((s) => s.sourcePath).filter(Boolean));
  const wbSources = new Set((await getAllWorldBooks()).map((w) => w.sourcePath).filter(Boolean));

  /** 导入一条聊天为归档故事；characterId 省略 = 未绑定。返回是否计入 stories */
  const importChat = async (chat: Pick<STScanChat, 'name' | 'path'>, fallbackCharName: string, characterId?: string) => {
    const src = sourcePathOf(plan.stRoot, chat.path);
    if (storySources.has(src)) {
      summary.skipped++;
      return;
    }
    try {
      const { messages, metadata } = parseJsonl(await stFs.readText(chat.path));
      if (messages.length === 0) throw new Error('空聊天文件');
      const session: ChatSession = {
        id: crypto.randomUUID(),
        title: chat.name,
        messages,
        character: { name: metadata?.character_name || fallbackCharName },
        user: { name: metadata?.user_name || 'User' },
        createdAt: Date.now(),
        rawMetadata: metadata,
      };
      const story = buildStoryFromSession(session, characterId);
      story.sourcePath = src;
      story.lastImportedAt = Date.now();
      await saveArchiveStory(story);
      storySources.add(src);
      summary.stories++;
    } catch (err) {
      console.warn(`[st-import] 聊天解析失败，跳过 ${chat.path}:`, err);
      summary.failed++;
    }
  };

  // 角色卡（先导卡拿到 id，聊天才有绑定目标）
  for (const c of plan.characters) {
    const src = sourcePathOf(plan.stRoot, c.pngPath);
    let charId = charBySource.get(src);
    if (charId) {
      summary.skipped++; // 卡已导入过：不重复建，但名下新聊天仍绑到原角色
    } else {
      try {
        const base64 = await stFs.readBinary(c.pngPath);
        const card = extractCharacterFromPngBuffer(base64ToArrayBuffer(base64));
        const character = buildCharacterFromCard(card, base64);
        character.sourcePath = src;
        await saveCharacter(character);
        charBySource.set(src, character.id);
        charId = character.id;
        summary.characters++;
      } catch (err) {
        console.warn(`[st-import] 角色卡解析失败，其聊天降级为未绑定导入 ${c.pngPath}:`, err);
        summary.failed++;
      }
    }
    for (const chat of c.chats) await importChat(chat, c.name, charId);
  }

  // 散聊天：未绑定故事（落 临时/）
  for (const chat of plan.strayChats) await importChat(chat, 'Character');

  // 世界书
  for (const wb of plan.worldbooks) {
    const src = sourcePathOf(plan.stRoot, wb.path);
    if (wbSources.has(src)) {
      summary.skipped++;
      continue;
    }
    try {
      const json = JSON.parse(await stFs.readText(wb.path)) as Record<string, unknown>;
      const now = Date.now();
      const item: WorldBookItem = {
        id: generateWorldBookId(),
        title: wb.name,
        worldbook: parseWorldBook(json),
        sourcePath: src,
        createdAt: now,
        updatedAt: now,
      };
      await saveWorldBook(item);
      wbSources.add(src);
      summary.worldbooks++;
    } catch (err) {
      console.warn(`[st-import] 世界书解析失败，跳过 ${wb.path}:`, err);
      summary.failed++;
    }
  }

  return summary;
}
