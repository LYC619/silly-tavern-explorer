import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TourStep {
  targetSelector: string;
  content: string;
  action: 'next' | 'click' | 'interact';
  /** For 'interact' action: CSS selector that when present means interaction is done */
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

function calcBubblePosition(rect: Rect): { pos: BubblePos; style: React.CSSProperties } {
  const pad = 16;
  const bw = 320;
  const bh = 120;

  // Prefer bottom
  if (rect.top + rect.height + pad + bh < window.innerHeight) {
    return {
      pos: 'bottom',
      style: {
        top: rect.top + rect.height + pad,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8)),
      },
    };
  }
  // Try top
  if (rect.top - pad - bh > 0) {
    return {
      pos: 'top',
      style: {
        top: rect.top - pad - bh,
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8)),
      },
    };
  }
  // Try right
  if (rect.left + rect.width + pad + bw < window.innerWidth) {
    return {
      pos: 'right',
      style: {
        top: Math.max(8, rect.top + rect.height / 2 - bh / 2),
        left: rect.left + rect.width + pad,
      },
    };
  }
  // Fallback left
  return {
    pos: 'left',
    style: {
      top: Math.max(8, rect.top + rect.height / 2 - bh / 2),
      left: Math.max(8, rect.left - pad - bw),
    },
  };
}

const TOUR_PAD = 8;

export function GuidedTour({ steps, module, onComplete, onSkip }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const rafRef = useRef<number>(0);

  const step = steps[currentStep];

  // Track target element position
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

  // For 'click' action: listen for click on target
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

  // For 'interact' action: poll for done selector or dialog close
  useEffect(() => {
    if (!step || step.action !== 'interact') return;
    const interval = setInterval(() => {
      if (step.interactDoneSelector) {
        const el = document.querySelector(step.interactDoneSelector);
        if (!el) {
          // Element gone = interaction complete
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

  const handleComplete = () => {
    onComplete();
  };

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
          <Button onClick={handleComplete} className="gap-2">
            开始使用
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!step || !targetRect) {
    return null;
  }

  const { style: bubbleStyle } = calcBubblePosition(targetRect);

  // Highlight cutout
  const cutout = {
    top: targetRect.top - TOUR_PAD,
    left: targetRect.left - TOUR_PAD,
    width: targetRect.width + TOUR_PAD * 2,
    height: targetRect.height + TOUR_PAD * 2,
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with cutout via SVG */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={cutout.left}
              y={cutout.top}
              width={cutout.width}
              height={cutout.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-300 pointer-events-none"
        style={{
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
        }}
      />

      {/* Allow clicks through to highlighted element */}
      <div
        className="absolute"
        style={{
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
          zIndex: 10000,
        }}
      />

      {/* Bubble */}
      <div
        className="absolute bg-card border border-border rounded-xl shadow-2xl p-4 w-80 animate-fade-in"
        style={{ ...bubbleStyle, zIndex: 10001 }}
      >
        {/* Skip button */}
        <button
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onSkip}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Step counter */}
        <div className="text-xs text-muted-foreground mb-2">
          {currentStep + 1} / {steps.length}
        </div>

        {/* Content */}
        <p className="text-sm text-foreground leading-relaxed pr-4">{step.content}</p>

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={onSkip}
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
    </div>
  );
}
