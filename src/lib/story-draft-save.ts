import type { ArchiveStory } from '@/types/archive';

export type StoryMutation = (
  current: ArchiveStory,
) => Partial<ArchiveStory> | undefined | Promise<Partial<ArchiveStory> | undefined>;

export type UpdateStory = (
  id: string,
  updater: StoryMutation,
) => Promise<ArchiveStory | undefined>;

/** 管理单个故事的待保存修改；每笔 mutation 都在落库时基于最新记录重放。 */
export class StoryDraftSaver {
  private pending: Array<{ id: string; mutation: StoryMutation }> = [];
  private dirty = false;
  private running: Promise<void> | null = null;

  constructor(private readonly update: UpdateStory) {}

  queueMutation(id: string, mutation: StoryMutation): void {
    this.pending.push({ id, mutation });
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  flush(): Promise<void> {
    if (!this.dirty) return this.running ?? Promise.resolve();
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.dirty) {
      const next = this.pending.shift();
      if (!next) {
        this.dirty = false;
        return;
      }
      try {
        const saved = await this.update(next.id, next.mutation);
        if (!saved) throw new Error('故事档案不存在');
        this.dirty = this.pending.length > 0;
      } catch (error) {
        this.pending.unshift(next);
        this.dirty = true;
        throw error;
      }
    }
  }
}

export async function flushBeforeStoryTransition(
  saver: StoryDraftSaver,
  transition: () => void | Promise<void>,
): Promise<void> {
  await saver.flush();
  await transition();
}
