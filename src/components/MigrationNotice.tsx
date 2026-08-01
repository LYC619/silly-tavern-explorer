/**
 * 存量迁移执行 + 首次说明弹窗（10.0）。挂在 App（VaultGate 内，库就绪后）。
 * - 每次启动后台跑 runArchiveMigration（增量幂等，正常情况秒级空转）
 * - 老库首次进新版（本地无 flag 且库里有角色）弹一次性说明：旧状态废弃去向 + 旧标签自动转 v2
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { runArchiveMigration } from '@/lib/archive-migrate';

const NOTICE_FLAG = 'ste-tag-migration-v2-notice';

/** 每个页面加载都会挂 App，但迁移一次就够：模块级单例承诺 */
let migrationOnce: Promise<{ characterCount: number }> | null = null;

export function MigrationNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let flagged = true;
    try { flagged = localStorage.getItem(NOTICE_FLAG) === '1'; } catch { /* 读不了就当已看过 */ }
    migrationOnce ??= runArchiveMigration().catch(() => ({ characterCount: 0 }));
    void migrationOnce.then((r) => {
      if (flagged) return;
      // 有角色的老库才值得弹；空库（新用户）静默立 flag，以后也不弹
      if (r.characterCount > 0) setOpen(true);
      try { localStorage.setItem(NOTICE_FLAG, '1'); } catch { /* 存不了就每次启动都可能弹，可接受 */ }
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <Button onClick={() => setOpen(false)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
