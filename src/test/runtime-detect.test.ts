/**
 * 三档运行环境的判定。
 *
 * 判定方式是嗅探壳注入的全局对象，所以这里就按注入来测：往 window 上塞对应的全局，
 * 看 detectRuntime 落在哪一档。要盯的两条边界：
 * - Capacitor 的 web 目标也会注入 window.Capacitor，但那时能力等同网页版，
 *   不能判成 capacitor（否则会去调根本不存在的原生插件）。
 * - 两个壳的全局同时在（异常注入）时优先 tauri：桌面端能力是超集，误判成它更安全。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { detectRuntime, hasNativeFs, isCapacitor, isTauri, RUNTIME_LABEL } from '@/lib/runtime';

type Win = Record<string, unknown>;

function setTauri() {
  (window as unknown as Win).__TAURI_INTERNALS__ = {};
}

function setCapacitor(native: boolean) {
  (window as unknown as Win).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => (native ? 'android' : 'web'),
  };
}

afterEach(() => {
  delete (window as unknown as Win).__TAURI_INTERNALS__;
  delete (window as unknown as Win).Capacitor;
});

describe('运行环境判定', () => {
  it('什么都没注入 = 网页版', () => {
    expect(detectRuntime()).toBe('web');
    expect(isTauri()).toBe(false);
    expect(isCapacitor()).toBe(false);
    expect(hasNativeFs()).toBe(false);
  });

  it('__TAURI_INTERNALS__ 在 = 桌面客户端', () => {
    setTauri();
    expect(detectRuntime()).toBe('tauri');
    expect(isTauri()).toBe(true);
    expect(hasNativeFs()).toBe(true);
  });

  it('Capacitor 原生壳 = Android 客户端', () => {
    setCapacitor(true);
    expect(detectRuntime()).toBe('capacitor');
    expect(isCapacitor()).toBe(true);
    expect(isTauri()).toBe(false);
    expect(hasNativeFs()).toBe(true);
  });

  it('Capacitor 的 web 目标仍算网页版——能力和浏览器一样', () => {
    setCapacitor(false);
    expect(isCapacitor()).toBe(false);
    expect(detectRuntime()).toBe('web');
  });

  it('Capacitor 全局形状不对时不当成原生（老版本没有 isNativePlatform）', () => {
    (window as unknown as Win).Capacitor = { getPlatform: () => 'android' };
    expect(isCapacitor()).toBe(false);
    expect(detectRuntime()).toBe('web');
  });

  it('两个壳的全局同时在时优先 tauri', () => {
    setTauri();
    setCapacitor(true);
    expect(detectRuntime()).toBe('tauri');
  });

  it('三档都有给用户看的名字', () => {
    expect(RUNTIME_LABEL.web).toBe('网页版');
    expect(RUNTIME_LABEL.tauri).toBe('桌面客户端');
    expect(RUNTIME_LABEL.capacitor).toBe('Android 客户端');
  });
});

describe('tauri-fs 的转发', () => {
  /** 二十多个文件从 vault/tauri-fs 导入 isTauri，转发断了会一起哑掉 */
  it('从 vault/tauri-fs 导入的 isTauri 与 runtime 里的是同一个', async () => {
    const legacy = await import('@/lib/vault/tauri-fs');
    expect(legacy.isTauri).toBe(isTauri);
  });
});
