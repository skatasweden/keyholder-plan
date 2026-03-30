import { useCallback, useState, type DragEvent } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  accept?: string
  label: string
  sublabel?: string
}

export function DropZone({ onFile, accept, label, sublabel }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-card p-10 text-center cursor-pointer
        transition-colors duration-150
        ${dragOver ? 'border-accent bg-accent-light/30' : 'border-border hover:border-brown-mid'}`}
    >
      <div className="text-3xl mb-2">{'\u{1F4C4}'}</div>
      <div className="text-sm font-medium text-brown-mid">{label}</div>
      {sublabel && <div className="text-xs text-text-muted mt-1">{sublabel}</div>}
      <input
        type="file"
        accept={accept}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
        className="hidden"
        id="file-input"
      />
      <label
        htmlFor="file-input"
        className="inline-block mt-4 px-5 py-2 bg-accent text-white text-sm font-bold
          rounded-pill cursor-pointer transition-all duration-200
          hover:bg-accent-dark hover:-translate-y-0.5"
      >
        Valj fil
      </label>
    </div>
  )
}
