/**
 * 本地显示设置（10.2/10.4）：与库数据无关的偏好，存 localStorage 不进库。
 * NSFW 卡面模糊：全局独立设置，默认开启（2026-08-01 用户拍板：少数人关一次，好过意外暴露）。
 */

const NSFW_BLUR_KEY = 'ste-nsfw-blur';
const HIDE_UNUSED_LIBRARY_TAGS_KEY = 'ste-hide-unused-library-tags';

export const LIBRARY_DISPLAY_SETTINGS_EVENT = 'ste-library-display-settings-change';

export function getNsfwBlur(): boolean {
  try {
    return localStorage.getItem(NSFW_BLUR_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setNsfwBlur(on: boolean): void {
  try {
    localStorage.setItem(NSFW_BLUR_KEY, on ? '1' : '0');
  } catch { /* 隐私模式存不了就用默认值 */ }
}

/** 默认保留零使用标签，帮助首次使用者理解可用分类。 */
export function getHideUnusedLibraryTags(): boolean {
  try {
    return localStorage.getItem(HIDE_UNUSED_LIBRARY_TAGS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideUnusedLibraryTags(on: boolean): void {
  try {
    localStorage.setItem(HIDE_UNUSED_LIBRARY_TAGS_KEY, on ? '1' : '0');
    window.dispatchEvent(new Event(LIBRARY_DISPLAY_SETTINGS_EVENT));
  } catch { /* 隐私模式存不了就用默认值 */ }
}
