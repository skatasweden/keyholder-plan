import { useState, useEffect } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Sok...' }: SearchInputProps) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => onChange(local), 300)
    return () => clearTimeout(timer)
  }, [local, onChange])

  useEffect(() => {
    setLocal(value)
  }, [value])

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
        {'\u{1F50D}'}
      </span>
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 bg-white border-[1.5px] border-border rounded-[10px]
          text-sm text-brown placeholder:text-text-muted
          focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
      />
    </div>
  )
}
