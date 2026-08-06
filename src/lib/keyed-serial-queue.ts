/** 同一 key 的任务严格串行，不同 key 可并行。失败不会阻断后续任务。 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.then(() => {}, () => {});
    this.tails.set(key, tail);
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return run;
  }
}
