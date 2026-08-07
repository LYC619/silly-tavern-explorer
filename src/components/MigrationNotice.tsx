/**
 * 存量迁移执行 + 首次说明弹窗（10.0）。挂在 App（VaultGate 内，库就绪后）。
 * - 每次启动先静默检查 schema，仅旧库进入阻塞迁移
 * - 老库首次进新版（本地无 flag 且库里有角色）弹一次性说明：旧状态废弃去向 + 旧标签自动转 v2
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { needsArchiveMigration, runArchiveMigration } from '@/lib/archive-migrate';

const NOTICE_FLAG = 'ste-tag-migration-v2-notice';

/** 每个页面加载都会挂 App，但迁移一次就够：模块级单例承诺 */
let migrationOnce: ReturnType<typeof runArchiveMigration> | null = null;

interface MigrationNoticeProps {
  children: ReactNode;
}

type MigrationState =
  | { status: 'checking' }
  | { status: 'running' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; showNotice: boolean };

export function MigrationNotice({ children }: MigrationNoticeProps) {
  const [state, setState] = useState<MigrationState>({ status: 'checking' });

  const start = useCallback((retry = false) => {
    if (retry) migrationOnce = null;
    setState({ status: 'checking' });
    void needsArchiveMigration().then((required) => {
      if (!required) {
        setState({ status: 'ready', showNotice: false });
        return;
      }

      setState({ status: 'running' });
      let flagged = true;
      try { flagged = localStorage.getItem(NOTICE_FLAG) === '1'; } catch { /* 读不了就当已看过 */ }
      const migration = migrationOnce ??= runArchiveMigration();
      return migration.then((result) => {
        const showNotice = !flagged && result.characterCount > 0;
        try { localStorage.setItem(NOTICE_FLAG, '1'); } catch { /* 存不了就每次启动都可能弹，可接受 */ }
        setState({ status: 'ready', showNotice });
      });
    }).catch((error: unknown) => {
      setState({ status: 'failed', message: error instanceof Error ? error.message : '未知错误' });
    });
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  if (state.status === 'checking') {
    return (
      <div className="h-full min-h-48 flex items-center justify-center" role="status" aria-label="正在检查档案库">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status !== 'ready') {
    return (
      <Dialog open>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{state.status === 'running' ? '正在升级档案库' : '档案库升级失败'}</DialogTitle>
            <DialogDescription>
              {state.status === 'running'
                ? '完成前暂时不能进入编辑页面，避免新旧数据互相覆盖。'
                : `迁移没有完成，任何数据都不会被标记为已升级。失败原因：${state.message}`}
            </DialogDescription>
          </DialogHeader>
          {state.status === 'running' ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DialogFooter>
              <Button onClick={() => start(true)}>重试</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      {children}
      <Dialog
        open={state.showNotice}
        onOpenChange={(open) => setState({ status: 'ready', showNotice: open })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>整理体系升级说明</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>这个版本把角色的整理方式换了一套，你的数据都在，只说明两处变化：</p>
                <p>
                  1. 角色的「游玩状态」（未开始/进行中等五档）已废弃——状态改到每个故事上单独维护；
                  角色本身改用互斥的「类型」（人物/剧情/玩法/综合/同人）归类，现在都是「未分类」，可在角色页随手补上。
                </p>
                <p>
                  2. 标签分类法升级：旧内置标签已自动转入新体系（如「评价/优秀」→「评价/精品」），
                  自定义标签全部保留，没归到类别的会显示在「未分类」里，不强制归类。
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setState({ status: 'ready', showNotice: false })}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
