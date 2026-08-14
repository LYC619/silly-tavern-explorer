/**
 * 角色页头部（10.3a，对照 character-detail.html 主列头部）：
 * 衬线大标题 + 铅笔（meta 编辑弹窗：展示名/作者/来源，只改本地展示不写回卡原件；AI 简介入口在弹窗内）
 * + 折叠切换（height/opacity 动画，10.3b 就地阅读时外部收起）+ byline + 简介段落
 * + 标签条（NSFW 开关+说明 → 分组内置快捷添加 → 自定义虚线标签 → +添加）
 * + creator_notes 原文折叠进「⋯」。
 * 标签编辑与评价档位确认逻辑从页面收进本组件。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pencil, ChevronDown, HelpCircle, Plus, X, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveCharacter } from '@/types/archive';
import type { CharacterPatch } from '@/lib/character-write';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import { introOf } from '@/lib/character-intro';
import {
  RATING_TIER_LABELS, RATING_TIER_PREFILL, type RatingTier, type TagCategory,
} from '@/lib/tag-taxonomy';
import { getLibraryTagPreferences } from '@/lib/archive-db';
import {
  buildManagedTagOptions,
  getTagCategories,
  normalizeLibraryTagPreferences,
  type LibraryTagPreferences,
} from '@/lib/library-tag-preferences';
import { IntroSection } from '@/components/character/IntroSection';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CharacterHeaderProps {
  character: ArchiveCharacter;
  norm: NormalizedCharacterCard;
  onPatch: (patch: CharacterPatch) => Promise<ArchiveCharacter>;
  /** 受控折叠（10.3b 就地阅读时外部收起）；不传则内部自理 */
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
}

export function CharacterHeader({ character, norm, onPatch, collapsed, onCollapsedChange }: CharacterHeaderProps) {
  const { toast } = useToast();
  const [innerCollapsed, setInnerCollapsed] = useState(false);
  const isCollapsed = collapsed ?? innerCollapsed;
  const setCollapsed = onCollapsedChange ?? setInnerCollapsed;

  const [metaOpen, setMetaOpen] = useState(false);
  const [metaDraft, setMetaDraft] = useState({ name: '', creator: '', source: '' });
  const [notesOpen, setNotesOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [tierConfirm, setTierConfirm] = useState<{ tier: RatingTier; value: number } | null>(null);
  const [tagPreferences, setTagPreferences] = useState<LibraryTagPreferences>(() => normalizeLibraryTagPreferences(undefined));
  const [tagDraft, setTagDraft] = useState(character.tags);
  const tagDraftRef = useRef(character.tags);

  const displayName = character.displayMeta?.name || character.name;
  const creator = character.displayMeta?.creator || norm.creator;
  const source = character.displayMeta?.source;
  const intro = introOf(character);

  const refreshTagPreferences = async () => {
    try {
      setTagPreferences(await getLibraryTagPreferences());
    } catch {
      // 标签快捷菜单仍可使用手动输入，不因偏好读取失败阻断角色页。
    }
  };

  useEffect(() => {
    void refreshTagPreferences();
  }, []);

  useEffect(() => {
    tagDraftRef.current = character.tags;
    setTagDraft(character.tags);
  }, [character.tags]);

  const quickTagOptions = useMemo(
    // 「隐藏」是角色库筛选栏的显示偏好，不限制这里的添加菜单；评价档位保留以走评分确认流程。
    () => buildManagedTagOptions(tagDraft, tagPreferences),
    [tagDraft, tagPreferences],
  );
  const quickTagCategories = useMemo(
    () => {
      const categories: TagCategory[] = getTagCategories(tagPreferences)
        .filter((category) => quickTagOptions.some((option) => option.category === category));
      if (quickTagOptions.some((option) => option.category === '未分类')) categories.push('未分类');
      return categories;
    },
    [quickTagOptions, tagPreferences],
  );

  const openMeta = () => {
    setMetaDraft({
      name: character.displayMeta?.name ?? '',
      creator: character.displayMeta?.creator ?? '',
      source: character.displayMeta?.source ?? '',
    });
    setMetaOpen(true);
  };

  const saveMeta = async () => {
    try {
      await onPatch({
        displayMeta: {
          name: metaDraft.name.trim() || undefined,
          creator: metaDraft.creator.trim() || undefined,
          source: metaDraft.source.trim() || undefined,
        },
      });
      setMetaOpen(false);
    } catch {
      // 父层已提示失败；保留弹窗和输入。
    }
  };

  const setTagChecked = async (raw: string, checked: boolean): Promise<boolean> => {
    if (!raw) return false;
    const current = tagDraftRef.current;
    const next = checked
      ? (current.includes(raw) ? current : [...current, raw])
      : current.filter((tag) => tag !== raw);
    if (next === current || next.length === current.length && next.every((tag, index) => tag === current[index])) {
      return true;
    }
    tagDraftRef.current = next;
    setTagDraft(next);
    try {
      await onPatch({ tags: next });
      return true;
    } catch {
      tagDraftRef.current = character.tags;
      setTagDraft(character.tags);
      return false;
    }
  };

  const addTag = async (raw: string) => {
    if (!raw || tagDraftRef.current.includes(raw)) return;
    if (await setTagChecked(raw, true)) {
      setNewTag((current) => (current.trim() === raw ? '' : current));
    }
  };

  /** 点评价档位（0801 补充）：未评分时弹确认预填中值；已评分则档位随评分自动 */
  const handleTierTagClick = (tier: RatingTier) => {
    if (character.rating !== undefined) {
      toast({ title: '已有评分', description: '评价档位随评分自动更新；要改档位请直接改评分。' });
      return;
    }
    setTierConfirm({ tier, value: RATING_TIER_PREFILL[tier] });
  };

  return (
    <header className="px-6 pt-5 pb-3 border-b border-[color:var(--hairline-inner)]">
      {/* 标题行（折叠时仅剩这一行） */}
      <div className="flex items-center gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-wide text-[color:var(--text-primary)] truncate" title={displayName}>
          {displayName}
        </h1>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={openMeta} aria-label="编辑展示信息">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <span className="flex-1" />
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]"
          aria-label={isCollapsed ? '展开简介' : '折叠简介'}
        >
          {isCollapsed ? '展开简介' : '折叠简介'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* 可折叠区：byline + 简介 + 标签条 + creator_notes（height/opacity 动画，不瞬切） */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {(creator || source) && (
              <p className="text-sm text-[color:var(--character-label)] mt-1">
                {[creator, source].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className={`text-sm leading-relaxed mt-2 max-w-3xl ${intro ? 'text-[color:var(--text-body)]' : 'text-[color:var(--character-label)]'}`}>
              {intro ?? '暂无简介 — 点标题旁的铅笔编辑，或在弹窗里用 AI 生成'}
            </p>

            {/* creator_notes 原文（清洗后不展示的声明类内容折叠在这里） */}
            {norm.creatorNotes.trim() && (
              <div className="mt-1.5">
                <button
                  onClick={() => setNotesOpen((v) => !v)}
                  className="text-sm text-[color:var(--character-label)] hover:text-[color:var(--text-body)] flex items-center gap-1"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  创作者备注原文
                </button>
                {notesOpen && (
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)] whitespace-pre-wrap max-w-3xl border-l-2 border-[color:var(--border-normal)] pl-2.5">
                    {norm.creatorNotes.trim()}
                  </p>
                )}
              </div>
            )}

            {/* 标签条：NSFW 开关 → 已有标签 → 快捷添加 */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <div className="flex items-center gap-1.5 pr-2 border-r border-[color:var(--hairline-inner)]">
                <Switch
                  id="nsfw-switch"
                  checked={!!character.nsfw}
                  onCheckedChange={(on) => { void onPatch({ nsfw: on }).catch(() => {}); }}
                  aria-label="NSFW 标记"
                />
                <Label htmlFor="nsfw-switch" className="text-xs text-[color:var(--text-muted)] cursor-pointer">NSFW</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="cursor-help text-[color:var(--character-label)]" aria-label="NSFW 标记说明">
                        <HelpCircle className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                      标记卡面尺度：开启后自动加“卡面/NSFW”标签；配合设置里的“模糊 NSFW 卡面”在列表打码。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {tagDraft.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 font-normal">
                  {t}
                  <button
                    onClick={() => { void setTagChecked(t, false); }}
                    aria-label={`删除标签 ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <Popover onOpenChange={(open) => { if (open) void refreshTagPreferences(); }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground">
                    <Plus className="w-3 h-3 mr-0.5" />标签
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(760px,calc(100vw-2rem))] max-h-[min(70vh,36rem)] overflow-y-auto p-3"
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {quickTagCategories.map((cat) => (
                    <section key={cat} className="min-w-0 rounded-md border border-[color:var(--hairline-inner)] p-2">
                      <p className="mb-1.5 truncate text-xs font-semibold text-[color:var(--text-primary)]" title={cat}>{cat}</p>
                      <div className="space-y-0.5">
                      {quickTagOptions.filter((option) => option.category === cat).map((option) => {
                        const raw = option.raw;
                        const has = tagDraft.includes(raw);
                        // 评价档位不直接打标签：走评分确认（评分→标签单向自动）
                        const isTier = cat === '评价' && (RATING_TIER_LABELS as readonly string[]).includes(option.label);
                        return (
                          <label key={raw} className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)]">
                            <Checkbox
                              checked={has}
                              aria-label={`${has ? '移除' : '添加'}标签 ${raw}`}
                              onCheckedChange={(checked) => {
                                if (isTier) handleTierTagClick(option.label as RatingTier);
                                else void setTagChecked(raw, checked === true);
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
                          </label>
                        );
                      })}
                      </div>
                    </section>
                  ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void addTag(newTag.trim());
                  }
                }}
                placeholder="自建：类别/子标签"
                className="h-6 w-32 text-xs"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* meta 编辑弹窗：展示层覆盖 + AI 简介入口（0801 反馈：AI 简介不占主页） */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑展示信息</DialogTitle>
            <DialogDescription>只改 STE 里的本地展示，不写回角色卡文件。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">展示名</Label>
              <Input value={metaDraft.name} onChange={(e) => setMetaDraft({ ...metaDraft, name: e.target.value })} placeholder={character.name} className="h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">作者</Label>
              <Input value={metaDraft.creator} onChange={(e) => setMetaDraft({ ...metaDraft, creator: e.target.value })} placeholder={norm.creator || '未知'} className="h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">来源</Label>
              <Input value={metaDraft.source} onChange={(e) => setMetaDraft({ ...metaDraft, source: e.target.value })} placeholder="如 类脑 / Discord" className="h-8 mt-1" />
            </div>
          </div>
          {/* 简介编辑与 AI 生成（IntroSection 完整能力：手动编辑/AI 草稿比较/历史/过期提示） */}
          <IntroSection character={character} norm={norm} onPatch={onPatch} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaOpen(false)}>关闭</Button>
            <Button onClick={() => void saveMeta()}>保存展示信息</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 点评价档位标签 → 评分确认（预填档位中值；确认写评分，档位标签随评分自动） */}
      <AlertDialog open={!!tierConfirm} onOpenChange={(open) => !open && setTierConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>标记为「{tierConfirm?.tier}」= 打个分</AlertDialogTitle>
            <AlertDialogDescription>
              评价档位与评分联动：确认后写入评分（0.5 步进），档位标签随评分自动更新。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {tierConfirm && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={tierConfirm.value}
                onChange={(e) => setTierConfirm({ ...tierConfirm, value: Number(e.target.value) })}
                className="h-9 w-24"
                aria-label="评分"
              />
              <span className="text-sm text-muted-foreground">/ 10</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!tierConfirm) return;
                const v = Math.min(10, Math.max(0, Math.round(tierConfirm.value * 2) / 2));
                void onPatch({ rating: v })
                  .then(() => setTierConfirm(null))
                  .catch(() => {});
              }}
            >
              确认评分
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
