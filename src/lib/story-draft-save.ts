import type { ArchiveStory } from '@/types/archive';

/** 管理单个故事的最新草稿；保存期间产生的新修改会在旧保存后继续落库。 */
export class StoryDraftSaver {
  private draft: ArchiveStory | null = null;
  private dirty = false;
  private running: Promise<void> | null = null;

  constructor(private readonly save: (story: ArchiveStory) => Promise<void>) {}

  setDraft(story: ArchiveStory): void {
    this.draft = story;
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
      const current = this.draft;
      if (!current) return;
      this.dirty = false;
      try {
        await this.save(current);
      } catch (error) {
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
