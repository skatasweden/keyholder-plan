'use client'

import { useCallback, useState } from 'react'
import { Upload, FileText, CheckCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SieUploadProps {
  onFileSelected: (file: File) => void
}

export function SieUpload({ onFileSelected }: SieUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.name.endsWith('.se') || file.name.endsWith('.si'))) {
        setSelectedFile(file)
        onFileSelected(file)
      }
    },
    [onFileSelected]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        setSelectedFile(file)
        onFileSelected(file)
      }
    },
    [onFileSelected]
  )

  return (
    <Card
      className={cn(
        'border-2 border-dashed transition-colors cursor-pointer',
        dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
        selectedFile && 'border-green-500 bg-green-50'
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-10">
        <label htmlFor="sie-file" className="cursor-pointer text-center">
          {selectedFile ? (
            <>
              <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
              <p className="mt-2 text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </p>
            </>
          ) : (
            <>
              <Upload className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm font-medium">
                Drag & drop your SIE4 file here
              </p>
              <p className="text-xs text-gray-500">
                or click to browse (.se or .si files)
              </p>
            </>
          )}
          <input
            id="sie-file"
            type="file"
            accept=".se,.si"
            className="hidden"
            onChange={handleFileInput}
          />
        </label>
      </CardContent>
    </Card>
  )
}
