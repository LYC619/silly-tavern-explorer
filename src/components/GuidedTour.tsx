import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { X, ChevronRight, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TourStep {
  targetSelector: string;
  content: string;
  action: 'next' | 'click' | 'interact';
  interactDoneSelector?: string;
}

interface GuidedTourProps {
  steps: TourStep[];
  module: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getElementRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

type BubblePos = 'top' | 'bottom' | 'left' | 'right';

function calcBubblePosition(rect: Rect, bw: number, bh: number): { pos: BubblePos; style: React.CSSProperties } {
  const pad = 16;

  if (rect.top + rect.height + pad + bh < window.innerHeight) {
    return {
      pos: 'bottom',
      style: {
        top: rect.top + rect.height + pad,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8)),
      },
    };
  }
  if (rect.top - pad - bh > 0) {
    return {
      pos: 'top',
      style: {
        top: rect.top - pad - bh,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8)),
      },
    };
  }
  if (rect.left + rect.width + pad + bw < window.innerWidth) {
    return {
      pos: 'right',
      style: {
        top: Math.max(8, rect.top + rect.height / 2 - bh / 2),
        left: rect.left + rect.width + pad,
      },
    };
  }
  return {
    pos: 'left',
    style: {
      top: Math.max(8, rect.top + rect.height / 2 - bh / 2),
      left: Math.max(8, rect.left - pad - bw),
    },
  };
}

function ensureNoOverlap(
  style: React.CSSProperties,
  cutout: Rect,
  bw: number,
  bh: number,
): React.CSSProperties {
  const bubbleLeft = style.left as number;
  const bubbleTop = style.top as number;
  if (
    bubbleTop < cutout.top + cutout.height &&
    bubbleTop + bh > cutout.top &&
    bubbleLeft < cutout.left + cutout.width &&
    bubbleLeft + bw > cutout.left
  ) {
    return {
      ...style,
      left: Math.min(cutout.left + cutout.width + 16, window.innerWidth - bw - 8),
    };
  }
  return style;
}

const TOUR_PAD = 8;

export function GuidedTour({ steps, module, onComplete, onSkip }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const rafRef = useRef<number>(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 120 });

  const step = steps[currentStep];

  const updateRect = useCallback(() => {
    if (!step) return;
    const rect = getElementRect(step.targetSelector);
    setTargetRect(rect);
    rafRef.current = requestAnimationFrame(updateRect);
  }, [step]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateRect]);

  useLayoutEffect(() => {
    if (bubbleRef.current) {
      const r = bubbleRef.current.getBoundingClientRect();
      setBubbleSize({ width: r.width, height: r.height });
    }
  }, [currentStep]);

  useEffect(() => {
    if (!step || step.action !== 'click') return;
    const el = document.querySelector(step.targetSelector);
    if (!el) return;
    const handler = () => {
      setTimeout(() => advance(), 300);
    };
    el.addEventListener('click', handler, { once: true });
    return () => el.removeEventListener('click', handler);
  }, [step, currentStep]);

  useEffect(() => {
    if (!step || step.action !== 'interact') return;
    let found = false;
    const interval = setInterval(() => {
      if (step.interactDoneSelector) {
        const el = document.querySelector(step.interactDoneSelector);
        if (el) {
          found = true;
        } else if (found) {
          clearInterval(interval);
          advance();
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [step, currentStep]);

  const advance = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      setShowCompletion(true);
      return;
    }
    setCurrentStep(prev => prev + 1);
  }, [currentStep, steps.length]);

  const handleSkipRequest = () => setShowSkipConfirm(true);

  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 animate-fade-in">
        <div className="bg-card rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl border border-border animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-display text-xl font-semibold mb-2">恭喜！引导完成 🎉</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {module === 'home'
              ? '您已掌握聊天记录处理的核心流程。可以继续探索书架、世界书编辑器和 AI 工具。'
              : '您已了解此模块的基本功能。'}
          </p>
          <Button onClick={onComplete} className="gap-2">
            开始使用
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!step) return null;

  // Fallback: target not found → show centered bubble without highlight
  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <div className="absolute inset-0 bg-black/55 pointer-events-auto" />
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-80 pointer-events-auto animate-fade-in">
            <button
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleSkipRequest}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-xs text-muted-foreground mb-2">
              {currentStep + 1} / {steps.length}
            </div>
            <p className="text-sm text-foreground leading-relaxed pr-4">{step.content}</p>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={advance} className="gap-1">
                下一步
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        {showSkipConfirm && (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 pointer-events-auto">
            <div className="bg-card rounded-xl p-6 max-w-sm mx-4 shadow-2xl border border-border">
              <p className="text-sm mb-4">确定要跳过新手引导吗？您可以在设置中随时重新开启。</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowSkipConfirm(false)}>继续引导</Button>
                <Button size="sm" onClick={onSkip}>跳过</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const cutout = {
    top: targetRect.top - TOUR_PAD,
    left: targetRect.left - TOUR_PAD,
    width: targetRect.width + TOUR_PAD * 2,
    height: targetRect.height + TOUR_PAD * 2,
  };

  const { style: rawStyle } = calcBubblePosition(targetRect, bubbleSize.width, bubbleSize.height);
  const bubbleStyle = ensureNoOverlap(rawStyle, cutout, bubbleSize.width, bubbleSize.height);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay with cutout - only opaque area blocks clicks */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x={cutout.left} y={cutout.top} width={cutout.width} height={cutout.height} rx="8" fill="black" />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'auto' }}
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-300 pointer-events-none"
        style={{ top: cutout.top, left: cutout.left, width: cutout.width, height: cutout.height }}
      />

      {/* Bubble */}
      <div
        ref={bubbleRef}
        className="absolute bg-card border border-border rounded-xl shadow-2xl p-4 w-80 max-h-[70vh] overflow-y-auto animate-fade-in pointer-events-auto"
        style={{ ...bubbleStyle, zIndex: 10001 }}
      >
        <button
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleSkipRequest}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-xs text-muted-foreground mb-2">
          {currentStep + 1} / {steps.length}
        </div>

        <p className="text-sm text-foreground leading-relaxed pr-4">{step.content}</p>

        <div className="mt-3 flex items-center justify-between">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleSkipRequest}
          >
            跳过引导
          </button>
          {step.action === 'next' && (
            <Button size="sm" onClick={advance} className="gap-1">
              下一步
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
          {step.action === 'click' && (
            <span className="text-xs text-primary animate-pulse">👆 请点击高亮区域</span>
          )}
          {step.action === 'interact' && (
            <span className="text-xs text-primary animate-pulse">✏️ 请操作后继续</span>
          )}
        </div>
      </div>

      {/* Skip confirmation */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 pointer-events-auto">
          <div className="bg-card rounded-xl p-6 max-w-sm mx-4 shadow-2xl border border-border">
            <p className="text-sm mb-4">确定要跳过新手引导吗？您可以在设置中随时重新开启。</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowSkipConfirm(false)}>
                继续引导
              </Button>
              <Button size="sm" onClick={onSkip}>
                跳过
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}