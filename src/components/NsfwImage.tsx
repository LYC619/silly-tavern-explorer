import type { ImgHTMLAttributes } from 'react';
import { getNsfwBlur } from '@/lib/local-settings';
import { shouldBlurNsfw } from '@/lib/nsfw-display';
import { cn } from '@/lib/utils';

interface NsfwImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  nsfw?: boolean;
  /** 角色详情首次点击后保持清晰；列表缩略图保持默认模糊。 */
  revealed?: boolean;
}

/** 统一卡面图片显示：全局设置默认模糊，调用方控制详情页揭示状态。 */
export function NsfwImage({ nsfw, revealed = false, className, ...props }: NsfwImageProps) {
  const blurred = shouldBlurNsfw(nsfw, getNsfwBlur(), revealed);
  return (
    <img
      {...props}
      data-nsfw-blurred={blurred ? 'true' : 'false'}
      className={cn(className, blurred && 'blur-xl scale-110 transition-all duration-300')}
    />
  );
}
