"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="立绘预览"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭预览"
        className="absolute top-4 right-4 rounded-md p-2 text-background/80 transition-colors hover:text-background"
      >
        <X className="size-5" />
      </button>
      <img
        src={src || "/placeholder.svg"}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  )
}
