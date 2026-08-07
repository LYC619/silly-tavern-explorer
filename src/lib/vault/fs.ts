/**
 * 文件库(FileVault)的文件系统抽象（2.0 阶段7.2）。
 *
 * 路径一律用 '/' 分隔、相对库根（如 '角色/赫敏/档案.json'）；由具体实现拼接绝对路径。
 * 两个实现：tauri-fs.ts（走 Rust 命令，真实磁盘）、createMemFs（内存，供 vitest 与策略开发）。
 * 二进制统一 base64 字符串（无 data: 前缀，与 ArchiveCharacter.pngBase64 同约定）。
 */

export interface VaultEntry {
  name: string;
  isDir: boolean;
  /** 递归导入必须跳过，防止链接越出用户选择的根目录。 */
  isSymlink?: boolean;
  size: number;
}

export interface VaultStat {
  exists: boolean;
  isDir: boolean;
}

export interface VaultFs {
  /** 列目录（目录优先、按名排序）；目录不存在返回 []，不抛错 */
  list(dir: string): Promise<VaultEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  /** 返回 base64（无前缀） */
  readBinary(path: string): Promise<string>;
  writeBinary(path: string, base64: string): Promise<void>;
  /** 只删单个文件；文件不存在时抛错 */
  removeFile(path: string): Promise<void>;
  /** 只删空目录；非空返回 false 并保留（用户自己放的文件永不删） */
  removeEmptyDir(path: string): Promise<boolean>;
  /** 目标已存在时拒绝（不覆盖） */
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<VaultStat>;
}

/** 规整相对路径：统一 '/'、去首尾斜杠与空段 */
export function normalizeRelPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s.length > 0)
    .join('/');
}

export function joinPath(...parts: string[]): string {
  return normalizeRelPath(parts.join('/'));
}

export function parentDir(p: string): string {
  const norm = normalizeRelPath(p);
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? '' : norm.slice(0, idx);
}

export function baseName(p: string): string {
  const norm = normalizeRelPath(p);
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? norm : norm.slice(idx + 1);
}

/** 内存实现：Map<相对路径, 内容>；文本与二进制分池存，目录由文件路径隐式存在 + 显式 mkdir 集合 */
export function createMemFs(): VaultFs & { dump(): Record<string, string> } {
  const texts = new Map<string, string>();
  const binaries = new Map<string, string>();
  const dirs = new Set<string>();

  const ensureParents = (path: string) => {
    let dir = parentDir(path);
    while (dir) {
      dirs.add(dir);
      dir = parentDir(dir);
    }
  };
  const allFiles = () => [...texts.keys(), ...binaries.keys()];
  const isDir = (p: string) => {
    const norm = normalizeRelPath(p);
    if (norm === '') return true;
    if (dirs.has(norm)) return true;
    return allFiles().some((f) => f.startsWith(norm + '/'));
  };

  return {
    async list(dir) {
      const norm = normalizeRelPath(dir);
      if (!isDir(norm)) return [];
      const prefix = norm === '' ? '' : norm + '/';
      const names = new Map<string, VaultEntry>();
      for (const f of allFiles()) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        const head = rest.split('/')[0];
        if (rest.includes('/')) {
          names.set(head, { name: head, isDir: true, size: 0 });
        } else if (!names.has(head)) {
          const size = texts.has(f) ? texts.get(f)!.length : Math.floor((binaries.get(f)!.length * 3) / 4);
          names.set(head, { name: head, isDir: false, size });
        }
      }
      for (const d of dirs) {
        if (norm === '' ? !d.includes('/') : d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) {
          const head = norm === '' ? d : d.slice(prefix.length);
          if (head) names.set(head, { name: head, isDir: true, size: 0 });
        }
      }
      // 与 Rust 实现同序：目录优先，名字按小写码点序
      return [...names.values()].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        const al = a.name.toLowerCase();
        const bl = b.name.toLowerCase();
        return al < bl ? -1 : al > bl ? 1 : 0;
      });
    },
    async readText(path) {
      const norm = normalizeRelPath(path);
      const v = texts.get(norm);
      if (v === undefined) throw new Error(`读取文件失败 ${norm}: 不存在`);
      return v;
    },
    async writeText(path, content) {
      const norm = normalizeRelPath(path);
      ensureParents(norm);
      texts.set(norm, content);
    },
    async readBinary(path) {
      const norm = normalizeRelPath(path);
      const v = binaries.get(norm);
      if (v === undefined) throw new Error(`读取文件失败 ${norm}: 不存在`);
      return v;
    },
    async writeBinary(path, base64) {
      const norm = normalizeRelPath(path);
      ensureParents(norm);
      binaries.set(norm, base64);
    },
    async removeFile(path) {
      const norm = normalizeRelPath(path);
      if (!texts.delete(norm) && !binaries.delete(norm)) {
        throw new Error(`删除文件失败 ${norm}: 不存在`);
      }
    },
    async removeEmptyDir(path) {
      const norm = normalizeRelPath(path);
      const hasChildren = allFiles().some((f) => f.startsWith(norm + '/')) ||
        [...dirs].some((d) => d.startsWith(norm + '/'));
      if (hasChildren) return false;
      dirs.delete(norm);
      return true;
    },
    async rename(from, to) {
      const f = normalizeRelPath(from);
      const t = normalizeRelPath(to);
      const stat = isDir(t) || texts.has(t) || binaries.has(t);
      if (stat) throw new Error(`目标已存在，拒绝覆盖: ${t}`);
      if (texts.has(f) || binaries.has(f)) {
        // 单文件改名
        if (texts.has(f)) {
          texts.set(t, texts.get(f)!);
          texts.delete(f);
        } else {
          binaries.set(t, binaries.get(f)!);
          binaries.delete(f);
        }
        ensureParents(t);
        return;
      }
      if (!isDir(f)) throw new Error(`改名失败 ${f}: 不存在`);
      // 目录改名：迁移所有子路径
      for (const m of [texts, binaries]) {
        for (const key of [...m.keys()]) {
          if (key.startsWith(f + '/')) {
            m.set(t + '/' + key.slice(f.length + 1), m.get(key)!);
            m.delete(key);
          }
        }
      }
      for (const d of [...dirs]) {
        if (d === f || d.startsWith(f + '/')) {
          dirs.delete(d);
          dirs.add(t + d.slice(f.length));
        }
      }
      ensureParents(t + '/x');
    },
    async mkdir(path) {
      const norm = normalizeRelPath(path);
      if (norm) {
        dirs.add(norm);
        ensureParents(norm + '/x');
      }
    },
    async stat(path) {
      const norm = normalizeRelPath(path);
      if (texts.has(norm) || binaries.has(norm)) return { exists: true, isDir: false };
      if (isDir(norm) && norm !== '') return { exists: true, isDir: true };
      return { exists: false, isDir: false };
    },
    dump() {
      const out: Record<string, string> = {};
      for (const [k, v] of texts) out[k] = v;
      for (const [k] of binaries) out[k] = '<binary>';
      return out;
    },
  };
}
