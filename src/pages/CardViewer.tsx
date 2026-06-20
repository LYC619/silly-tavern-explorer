import { useState, useEffect, useCallback, useRef } from 'react';
import { IdCard, Upload, Save, History, Download, FileJson, Image } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { HelpCard } from '@/components/HelpCard';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { CharacterCardEditor } from '@/components/CharacterCardViewer';
import {
  extractCharacterFromPng, parseCharacterCardJson, normalizeCharacterCard,
  type NormalizedCharacterCard, type STCharacterCard,
} from '@/lib/png-parser';
import {
  applyEditsToCard, exportCardJson, editsFromNormalized, type CardEdits,
} from '@/lib/card-export';
import { embedCharaInPngBlob } from '@/lib/png-writer';
import { getAllCards, getCard, saveCard, deleteCard, pruneAutoSavedCards } from '@/lib/card-db';
import { generateCardId, type CardItem } from '@/types/character-card';

const CARD_SESSION_KEY = 'card-active-session';

function sanitizeFilename(name: string): string {
  const cleaned = (name || '').replace(/[/\\:*?"<>|-]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 100);
  return cleaned || 'character';
}

function download(content: BlobPart, filename: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** ArrayBuffer → 纯 base64（无 data: 前缀） */
function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
/** 纯 base64 → ArrayBuffer */
function base64ToAb(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default function CardViewer() {
  const { toast } = useToast();
  const [card, setCard] = useState<NormalizedCharacterCard | null>(null);
  const [edits, setEdits] = useState<CardEdits | null>(null);
  const [fileName, setFileName] = useState('character');
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<CardItem[]>([]);
  // PNG 导入时的原图字节（用于导出 PNG 回写）；JSON 导入为 null
  const pngBytesRef = useRef<ArrayBuffer | null>(null);

  const refreshSaved = useCallback(async () => {
    try { setSavedItems(await getAllCards()); } catch { /* ignore */ }
  }, []);

  // 跨页恢复
  useEffect(() => {
    refreshSaved();
    let ptrId: string | null = null;
    try {
      const raw = sessionStorage.getItem(CARD_SESSION_KEY);
      ptrId = raw ? (JSON.parse(raw).itemId as string) : null;
    } catch { /* ignore */ }
    if (ptrId) {
      getCard(ptrId).then((item) => {
        if (item) loadCardItem(item);
      }).catch(() => { /* ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (currentItemId) sessionStorage.setItem(CARD_SESSION_KEY, JSON.stringify({ itemId: currentItemId }));
      else sessionStorage.removeItem(CARD_SESSION_KEY);
    } catch { /* ignore */ }
  }, [currentItemId]);

  const setCardState = (raw: STCharacterCard, name: string, png: ArrayBuffer | null) => {
    const normalized = normalizeCharacterCard(raw);
    setCard(normalized);
    setEdits(editsFromNormalized(normalized));
    setFileName(name);
    pngBytesRef.current = png;
  };

  const loadCardItem = useCallback((item: CardItem) => {
    setCardState(item.card, item.title, item.pngBase64 ? base64ToAb(item.pngBase64) : null);
    setCurrentItemId(item.id);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    try {
      let raw: STCharacterCard;
      let png: ArrayBuffer | null = null;
      if (lower.endsWith('.png')) {
        png = await file.arrayBuffer();
        raw = await extractCharacterFromPng(file);
      } else if (lower.endsWith('.json')) {
        raw = parseCharacterCardJson(await file.text());
      } else {
        toast({ title: '请选择 .png 或 .json 角色卡文件', variant: 'destructive' });
        return;
      }
      const name = file.name.replace(/\.(png|json)$/i, '');
      setCardState(raw, name, png);
      // 自动留存为导入历史
      (async () => {
        const id = generateCardId();
        const now = Date.now();
        await saveCard({ id, title: name, card: raw, pngBase64: png ? abToBase64(png) : undefined, createdAt: now, updatedAt: now, autoSaved: true });
        setCurrentItemId(id);
        await pruneAutoSavedCards(5);
        await refreshSaved();
      })().catch(() => { /* 自动历史失败不阻塞 */ });
      toast({ title: '角色卡导入成功', description: png ? 'PNG 卡，可编辑并导出 PNG/JSON' : 'JSON 卡，可编辑并导出 JSON' });
    } catch (e) {
      toast({ title: '解析失败', description: e instanceof Error ? e.message : '文件不是有效的角色卡', variant: 'destructive' });
    }
  }, [toast, refreshSaved]);

  const onEditChange = useCallback(<K extends keyof CardEdits>(key: K, value: CardEdits[K]) => {
    setEdits((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  // 当前编辑后的完整卡对象
  const buildEditedCard = useCallback((): STCharacterCard | null => {
    if (!card || !edits) return null;
    return applyEditsToCard(card.raw, edits);
  }, [card, edits]);

  const handleExportJson = useCallback(() => {
    const edited = buildEditedCard();
    if (!edited) return;
    download(exportCardJson(edited), `${sanitizeFilename(fileName)}.json`, 'application/json;charset=utf-8');
  }, [buildEditedCard, fileName]);

  const handleExportPng = useCallback(() => {
    const edited = buildEditedCard();
    if (!edited || !pngBytesRef.current) return;
    download(embedCharaInPngBlob(pngBytesRef.current, edited), `${sanitizeFilename(fileName)}.png`, 'image/png');
  }, [buildEditedCard, fileName]);

  const handleSave = useCallback(async () => {
    const edited = buildEditedCard();
    if (!edited) return;
    const id = currentItemId || generateCardId();
    const now = Date.now();
    const png = pngBytesRef.current;
    await saveCard({
      id, title: fileName, card: edited,
      pngBase64: png ? abToBase64(png) : undefined,
      createdAt: currentItemId ? (savedItems.find((s) => s.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
      autoSaved: false,
    });
    setCurrentItemId(id);
    await refreshSaved();
    toast({ title: '已保存', description: '可在「已存角色卡」中查看；永久留存、纳入完整备份' });
  }, [buildEditedCard, currentItemId, fileName, savedItems, refreshSaved, toast]);

  const handleDeleteItem = useCallback(async (id: string) => {
    await deleteCard(id);
    if (id === currentItemId) setCurrentItemId(null);
    await refreshSaved();
  }, [currentItemId, refreshSaved]);

  const hasPng = pngBytesRef.current !== null;

  const actions = card && edits && (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm"><History className="w-4 h-4 mr-1.5" /> 已存角色卡</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <h4 className="text-sm font-medium mb-2">已存角色卡（{savedItems.length}）</h4>
          <ScrollArea className="max-h-72">
            <div className="space-y-1">
              {savedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/40 text-sm">
                  {item.pngBase64 ? <Image className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <FileJson className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <button className="flex-1 min-w-0 text-left truncate" onClick={() => loadCardItem(item)}>
                    {item.title}{item.autoSaved && <span className="text-[10px] text-muted-foreground ml-1">(历史)</span>}
                  </button>
                  <button className="text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={() => handleDeleteItem(item.id)}>删除</button>
                </div>
              ))}
              {savedItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">暂无</p>}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={handleSave}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
      <Button variant="outline" size="sm" onClick={handleExportJson}><Download className="w-4 h-4 mr-1.5" /> 导出 JSON</Button>
      <Button variant="outline" size="sm" onClick={handleExportPng} disabled={!hasPng} title={hasPng ? '' : 'JSON 导入的卡无原图，无法导出 PNG'}>
        <Image className="w-4 h-4 mr-1.5" /> 导出 PNG
      </Button>
    </>
  );

  return (
    <AppLayout actions={actions}>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
            <IdCard className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold flex items-center gap-2">
              角色卡编辑
              <HelpCard>
                导入 SillyTavern 角色卡（PNG 或 JSON，支持 V1/V2/V3），编辑核心字段（描述、性格、开场白等）后导出归档。PNG 卡可回写图片导出 PNG；JSON 卡导出 JSON。未编辑的字段（内嵌世界书、扩展、立绘资源等）在导出时原样保留。
              </HelpCard>
            </h1>
            <p className="text-sm text-muted-foreground">导入现有卡 → 编辑核心字段 → 导出（PNG 回写 / JSON）</p>
          </div>
        </div>
        <CharacterCardEditor card={card} edits={edits} onEditChange={onEditChange} onLoadFile={loadFile} />
      </div>
    </AppLayout>
  );
}
