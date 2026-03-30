const typeColors: Record<string, string> = {
  T: 'bg-green-100 text-green-800',
  S: 'bg-blue-100 text-blue-800',
  K: 'bg-orange-100 text-orange-800',
  I: 'bg-purple-100 text-purple-800',
}

export function Badge({ type }: { type: string | null }) {
  if (!type) return null
  const colors = typeColors[type] ?? 'bg-gray-100 text-gray-800'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-badge text-[11px] font-bold ${colors}`}>
      {type}
    </span>
  )
}
