import "@testing-library/jest-dom/vitest";

/**
 * 绝大多数用例跑在 jsdom 环境（vitest.config.ts 的默认），这里给 jsdom 缺的
 * matchMedia 打桩。
 *
 * 但少数文件必须用 `// @vitest-environment node` 单独声明成 node 环境——jsdom 会
 * 把 Uint8Array 换成另一个 realm 的构造器，靠 typed array 判定分支的库在里面会
 * 走错路径：fflate 的 zipSync 在 jsdom 下把 96KB 文本「压」成 9.7MB 且解不回来，
 * 连 level:0（STORE，本来不可能膨胀）也一样，在 node 下同一段代码完全正常。
 * 所以压缩/编解码这类字节级代码的用例一律声明 node 环境。
 *
 * 那些文件里没有 window，所以这里必须判一下再打桩，否则 setup 直接抛
 * ReferenceError，整个文件收集不到用例。
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
