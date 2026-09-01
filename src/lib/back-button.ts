/**
 * Android 系统返回键的处理栈。
 *
 * Capacitor 的 backButton 事件是全局一发，谁都收得到；但「返回」在不同层上意思不同：
 * 沉浸阅读中该退沉浸、抽屉开着该关抽屉、在子页面该回上一级、在一级页面该把应用
 * 最小化（**不是退出**——退出会把用户读到哪、抽屉状态全丢掉，而 Android 的习惯是
 * 返回到桌面、应用还在后台）。
 *
 * 所以做成一个栈：各层挂载时注册自己的关闭动作，返回键从栈顶往下问，第一个说
 * 「我处理了」的就停。没人处理才落到路由兜底。
 *
 * 用模块级栈 + 函数注册，理由同 lib/immersive-mode：可关闭的层散落在各处
 * （两个抽屉在 AppLayout，两个阅读器在三个页面里，还有一路嵌在角色页内），
 * 走 context 得把 provider 提到最外面再逐层传。
 *
 * Radix 的浮层（Dialog/Sheet/AlertDialog/DropdownMenu）不用逐个注册：它们自己维护
 * 层级栈并响应 Escape，返回键只要合成一次 Escape 就能关掉最上面那个。见 handleBackPress。
 */

/** 处理器返回 true = 我消费了这次返回，别再往下传 */
export type BackHandler = () => boolean;

interface Entry {
  id: number;
  handler: BackHandler;
}

let nextId = 1;
const stack: Entry[] = [];

/**
 * 注册一个返回键处理器。返回注销函数。
 * 后注册的先被问到（视觉上更靠上的层通常也更晚挂载）。
 */
export function registerBackHandler(handler: BackHandler): () => void {
  const entry: Entry = { id: nextId++, handler };
  stack.push(entry);
  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 当前是否有层愿意接返回键（调试与测试用） */
export function backHandlerCount(): number {
  return stack.length;
}

/** 仅供测试：清空栈 */
export function resetBackHandlers(): void {
  stack.length = 0;
}

/**
 * Radix 浮层是否有打开的。
 *
 * 认 `[data-state="open"]` 且带 dialog/menu 语义的节点——Radix 给每个打开的浮层
 * 内容节点都挂这两样。只读 DOM 不改，判错的代价也只是多合成一次 Escape（无害）。
 */
function hasOpenRadixLayer(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(
    '[data-state="open"][role="dialog"],'
    + '[data-state="open"][role="alertdialog"],'
    + '[data-state="open"][role="menu"],'
    + '[data-state="open"][role="listbox"]',
  ) !== null;
}

export type BackPressOutcome = 'closed-layer' | 'handled' | 'unhandled';

/**
 * 处理一次返回键。
 *
 * 顺序：Radix 浮层 → 注册的层（栈顶往下）→ 交给调用方兜底（路由/最小化）。
 * 浮层排最前是因为它可能开在别的层之上（沉浸阅读里弹的章节对话框）。
 */
export function handleBackPress(): BackPressOutcome {
  if (hasOpenRadixLayer()) {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
    return 'closed-layer';
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].handler()) return 'handled';
  }

  return 'unhandled';
}

// ---------- 路由兜底 ----------

/** 一级页面：返回键在这些路径上应该最小化应用，而不是继续往上退 */
const TOP_LEVEL_PATHS = new Set(['/', '/library', '/chat', '/assets']);

export function isTopLevelPath(pathname: string): boolean {
  return TOP_LEVEL_PATHS.has(pathname);
}
