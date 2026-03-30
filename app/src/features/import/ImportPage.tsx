import { useNavigate } from 'react-router-dom'
import { DropZone } from '@/components/ui/DropZone'
import { useImport } from '@/hooks/useImport'

export function ImportPage() {
  const navigate = useNavigate()
  const importMutation = useImport()

  const handleFile = (file: File) => {
    importMutation.mutate(file, {
      onSuccess: (data) => {
        if (data.companyId) {
          navigate(`/company/${data.companyId}`)
        }
      },
    })
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="font-display font-black text-3xl text-brown tracking-tight mb-2">
        Importera SIE4
      </h1>
      <p className="text-text-body mb-8">
        Ladda upp en SIE4-fil (.se) for att importera bokforingsdata.
      </p>

      <DropZone
        onFile={handleFile}
        accept=".se,.si,.sie"
        label="Dra och slapp en SIE4-fil har"
        sublabel="Stoder alla SIE4-filer (.se) fran Fortnox, Visma, etc."
      />

      {importMutation.isPending && (
        <div className="mt-6 p-4 bg-white rounded-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
            <span className="text-sm text-brown-mid">Importerar...</span>
          </div>
        </div>
      )}

      {importMutation.isSuccess && (
        <div className="mt-6 p-4 bg-white rounded-card border border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-pass rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{'\u2713'}</span>
            </div>
            <span className="text-sm font-semibold text-brown">Import klar</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {Object.entries(importMutation.data.stats).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-text-muted">{key}:</span>
                <span className="font-medium tabular-nums">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {importMutation.isError && (
        <div className="mt-6 p-4 bg-fail/10 rounded-card border border-fail/30">
          <span className="text-sm text-fail font-medium">
            {importMutation.error.message}
          </span>
        </div>
      )}
    </div>
  )
}
