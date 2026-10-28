import {
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
  Video,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatAttachment, ChatMessage, Department } from '../types'
import { ROLE_LABELS } from '../types'
import type { ActorContext } from '../lib/rules'
import { canUseDeptChat } from '../lib/rules'
import {
  blobToAttachment,
  fileToAttachment,
  formatBytes,
  MAX_CHAT_FILE_BYTES,
} from '../lib/chatFiles'
import { getChatBlob } from '../lib/chatMediaDb'

interface Props {
  department: Department
  messages: ChatMessage[]
  actor: ActorContext | null
  onSend: (input: {
    text: string
    attachments: ChatAttachment[]
  }) => void
  onDelete: (messageId: string) => void
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DepartmentChat({
  department,
  messages,
  actor,
  onSend,
  onDelete,
}: Props) {
  const allowed = canUseDeptChat(actor, department.id)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<ChatAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, pending.length])

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (!allowed) {
    return (
      <div className="dept-glass flex h-full min-h-0 flex-col items-center justify-center border px-4 text-center">
        <p className="m-0 text-sm text-[var(--accent-hot)]">
          Чат доступен только сотрудникам этого отдела.
        </p>
        <p className="mt-2 m-0 text-xs text-[var(--text-muted)]">
          Люди из других отделов сообщения и файлы здесь не видят.
        </p>
      </div>
    )
  }

  const addFiles = async (files: FileList | File[]) => {
    setError(null)
    setBusy(true)
    try {
      const list = Array.from(files)
      const next: ChatAttachment[] = []
      for (const file of list) {
        next.push(await fileToAttachment(file))
      }
      setPending((prev) => [...prev, ...next])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка файла')
    } finally {
      setBusy(false)
    }
  }

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed && pending.length === 0) return
    onSend({ text: trimmed, attachments: pending })
    setText('')
    setPending([])
    setError(null)
  }

  const startVoice = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void (async () => {
          try {
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
            if (blob.size > MAX_CHAT_FILE_BYTES) {
              setError('Голосовое слишком длинное — запишите короче')
              return
            }
            const att = await blobToAttachment(
              blob,
              `голос-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.webm`,
            )
            setPending((prev) => [...prev, att])
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка записи')
          } finally {
            setRecording(false)
            mediaRecorderRef.current = null
          }
        })()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Нет доступа к микрофону')
      setRecording(false)
    }
  }

  const stopVoice = () => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else setRecording(false)
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Чат отдела · только {department.name}
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Общение и обмен фото, видео, голосом и файлами. Видят только
          сотрудники этого отдела. Своё сообщение можно удалить — его больше
          никто не увидит.
        </p>
      </div>

      <div className="roster-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2 sm:p-3">
        {messages.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
            Пока тихо. Напишите сообщение или прикрепите файл.
          </p>
        ) : (
          messages.map((msg) => {
            const mine = actor?.employee.id === msg.authorId
            return (
              <div
                key={msg.id}
                className={`max-w-[92%] rounded-md border px-3 py-2 sm:max-w-[75%] ${
                  mine
                    ? 'ml-auto border-[var(--accent)]/40 bg-[var(--accent)]/10'
                    : 'mr-auto border-[var(--border)] bg-black/45'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {msg.authorName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                      {ROLE_LABELS[msg.authorRole]} ·{' '}
                      {formatMsgTime(msg.createdAt)}
                    </span>
                    {mine ? (
                      <button
                        type="button"
                        title="Удалить своё сообщение"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Удалить сообщение? Его больше никто в отделе не увидит.',
                            )
                          ) {
                            onDelete(msg.id)
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--accent-hot)]/15 hover:text-[var(--accent-hot)]"
                      >
                        <Trash2 size={12} />
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </div>
                {msg.text ? (
                  <p className="m-0 whitespace-pre-wrap text-sm leading-snug text-[var(--text)]">
                    {msg.text}
                  </p>
                ) : null}
                {msg.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {msg.attachments.map((att) => (
                      <AttachmentView key={att.id} attachment={att} />
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {pending.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)]/60 px-3 py-2">
          {pending.map((att) => (
            <button
              key={att.id}
              type="button"
              title="Убрать"
              onClick={() =>
                setPending((prev) => prev.filter((p) => p.id !== att.id))
              }
              className="inline-flex max-w-[180px] items-center gap-1 truncate border border-[var(--border)] bg-black/50 px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent-hot)] hover:text-[var(--accent-hot)]"
            >
              {att.kind === 'image' ? (
                <ImageIcon size={12} />
              ) : att.kind === 'video' ? (
                <Video size={12} />
              ) : att.kind === 'audio' ? (
                <Mic size={12} />
              ) : (
                <FileText size={12} />
              )}
              <span className="truncate">{att.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="shrink-0 px-3 py-1 text-[11px] text-[var(--accent-hot)]">
          {error}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[var(--border)] p-2 sm:p-3">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy || recording}
            title="Фото, видео, файлы"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            disabled={busy}
            title={recording ? 'Стоп' : 'Голосовое'}
            onClick={() => (recording ? stopVoice() : void startVoice())}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center border ${
              recording
                ? 'border-[var(--accent-hot)] text-[var(--accent-hot)]'
                : 'border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)]'
            } disabled:opacity-40`}
          >
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <textarea
            value={text}
            rows={2}
            placeholder="Сообщение отделу…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            className="min-h-[40px] min-w-0 flex-1 resize-none border border-[var(--border)] bg-black/55 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={busy || recording || (!text.trim() && pending.length === 0)}
            onClick={send}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-40"
            title="Отправить"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-1.5 m-0 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
          До {formatBytes(MAX_CHAT_FILE_BYTES)} на файл (IndexedDB) · Enter —
          отправить · Shift+Enter — новая строка
        </p>
      </div>
    </div>
  )
}

function useAttachmentSrc(attachment: ChatAttachment): string | null {
  const [src, setSrc] = useState<string | null>(attachment.dataUrl ?? null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    if (attachment.dataUrl) {
      setSrc(attachment.dataUrl)
      return
    }

    void (async () => {
      try {
        const blob = await getChatBlob(attachment.id)
        if (cancelled) return
        if (!blob) {
          setSrc(null)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (!cancelled) setSrc(null)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.id, attachment.dataUrl])

  return src
}

function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const src = useAttachmentSrc(attachment)

  if (!src) {
    return (
      <div className="border border-[var(--border)] bg-black/40 px-2 py-1.5 text-xs text-[var(--text-muted)]">
        {attachment.name} · {formatBytes(attachment.size)} · загрузка…
      </div>
    )
  }

  if (attachment.kind === 'image') {
    return (
      <a href={src} download={attachment.name} className="block">
        <img
          src={src}
          alt={attachment.name}
          className="max-h-56 max-w-full rounded border border-[var(--border)] object-contain"
        />
      </a>
    )
  }
  if (attachment.kind === 'video') {
    return (
      <video
        controls
        src={src}
        className="max-h-56 w-full rounded border border-[var(--border)]"
      />
    )
  }
  if (attachment.kind === 'audio') {
    return (
      <div className="rounded border border-[var(--border)] bg-black/40 px-2 py-2">
        <div className="mb-1 truncate font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
          {attachment.name} · {formatBytes(attachment.size)}
        </div>
        <audio controls src={src} className="w-full" />
      </div>
    )
  }
  return (
    <a
      href={src}
      download={attachment.name}
      className="inline-flex items-center gap-2 border border-[var(--border)] bg-black/40 px-2 py-1.5 text-xs text-[var(--accent)] hover:border-[var(--accent)]"
    >
      <FileText size={14} />
      <span className="truncate">{attachment.name}</span>
      <span className="text-[var(--text-muted)]">
        {formatBytes(attachment.size)}
      </span>
    </a>
  )
}
