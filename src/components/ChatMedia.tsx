import { useMediaUrl } from '../hooks/useMediaUrl'
import { mediaKind } from '../utils/chat'
import type { ChatMessage } from '../types/db'

/** The photo or voice note inside a chat bubble. */
export function ChatMedia({ message, onOpenImage }: { message: ChatMessage; onOpenImage: (url: string) => void }) {
  const kind = mediaKind(message)
  const { url, failed } = useMediaUrl(message.media_path)

  if (failed) {
    return <p className="mb-1 text-[12.5px] font-semibold italic text-muted">Could not load this file. Open WhatsApp to view.</p>
  }

  if (kind === 'audio') {
    return url ? (
      <audio controls preload="none" src={url} className="mb-1 h-[40px] w-[230px] max-w-full" />
    ) : (
      <div className="mb-1 h-[40px] w-[230px] max-w-full animate-pulse rounded-full bg-cream" />
    )
  }

  return url ? (
    <button type="button" onClick={() => onOpenImage(url)} className="mb-1 block overflow-hidden rounded-[8px]" aria-label="Open photo">
      <img src={url} alt="Photo from customer" loading="lazy" className="max-h-[280px] w-full min-w-[160px] object-cover" />
    </button>
  ) : (
    <div className="mb-1 h-[160px] w-[220px] max-w-full animate-pulse rounded-[8px] bg-cream" />
  )
}
