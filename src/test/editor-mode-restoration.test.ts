import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAV_AREAS } from '@/lib/navigation-model';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('editor entry restoration', () => {
  it('opens the chat workbench directly from the editor area entry', () => {
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    const editorArea = NAV_AREAS.find((area) => area.key === 'editor');

    expect(editorArea?.path).toBe('/chat');
    expect(home).toMatch(/label="进入编辑区"[^\n]*navigate\('\/chat'\)/);
    expect(tools).toContain("import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'");
    expect(tools).toContain('if (!focusView && !assetFocus) return <Navigate to="/chat" replace />;');
    expect(tools).not.toContain('if (!focus) return <Navigate to="/chat" replace />;');
  });

  it('keeps the organizer entry routes separate from the chat workbench', () => {
    const navigation = read('src/lib/navigation-model.ts');
    expect(navigation).toContain("path: '/tools?focus=summary'");
    expect(navigation).toContain("path: '/tools?focus=story-tree'");
    expect(navigation).toContain("path: '/tools?focus=worldbook'");
    expect(navigation).toContain("path: '/tools?focus=preset'");
  });

  it('uses one story context for the organizer views', () => {
    const workspace = read('src/pages/StoryWorkspace.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(workspace).toContain('setEditorStoryId');
    expect(tools).toContain('buildEditorStoryPath');
    expect(tools).not.toContain('STImportCard');
    expect(tools).not.toContain('进入分卷总结');
  });

  it('keeps the SillyTavern directory entry reachable after retiring the tools landing page', () => {
    const dialog = read('src/components/tools/STAIConfigDialog.tsx');

    expect(dialog).toContain("saveSettingsSection('directories')");
    expect(dialog).toContain("navigate('/settings')");
    expect(dialog).not.toContain("navigate('/tools')");
    expect(dialog).toContain('去设置接入 ST');
  });
});
