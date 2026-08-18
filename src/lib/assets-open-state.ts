/** AppLayout 重挂时保留附属库的展开状态；应用重启后仍从折叠态开始。 */
let assetsOpen = false;

export function getAssetsOpen(): boolean {
  return assetsOpen;
}

export function setAssetsOpenState(next: boolean): void {
  assetsOpen = next;
}
