import { NsfwImage } from '@/components/NsfwImage';
import { placeholderArtClass } from '@/lib/character-placeholder';
import { displayCharacterName } from '@/lib/library-query';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';

interface CharacterPortraitProps {
  character: ArchiveCharacter;
  /** 图片本身的类名；容器由调用方负责定位与裁剪 */
  className?: string;
  /** 无立绘时占位图上的首字水印字号；不传则不画水印（列表缩略图用） */
  markFontSize?: number | 'default';
}

/**
 * 角色立绘或渐变占位图，铺满定位父容器。
 *
 * NSFW 模糊统一走 `<NsfwImage>`——角色库原先在网格卡和列表行里各手写了一遍
 * `c.nsfw && nsfwBlur && 'blur-…'`，绕过了项目自己的抽象（Home.tsx 用的是对的）。
 */
export function CharacterPortrait({ character, className, markFontSize }: CharacterPortraitProps) {
  const displayName = displayCharacterName(character);
  if (character.pngBase64) {
    return (
      <NsfwImage
        src={`data:image/png;base64,${character.pngBase64}`}
        alt={displayName}
        nsfw={character.nsfw}
        className={cn('absolute inset-0 w-full h-full object-cover object-top', className)}
        loading="lazy"
      />
    );
  }
  return (
    <div className={cn('absolute inset-0', placeholderArtClass(character.name))}>
      {markFontSize !== undefined && (
        <div className="char-mark" style={markFontSize === 'default' ? undefined : { fontSize: markFontSize }}>
          {displayName.slice(0, 1)}
        </div>
      )}
    </div>
  );
}
