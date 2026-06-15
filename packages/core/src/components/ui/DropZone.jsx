import React, { useRef, useState, useCallback } from 'react'
import clsx from 'clsx'
import { formatBytes, getRootFolderName } from '../../lib/utils'

/**
 * @param {{
 *   onFilesSelected: (files: FileList, mode: 'files'|'folder') => void,
 *   selectedFiles: File[],
 *   disabled?: boolean
 * }} props
 */
export default function DropZone({ onFilesSelected, selectedFiles, disabled = false }) {
  const fileInputRef   = useRef(null)
  const folderInputRef = useRef(null)
  const [dragging, setDragging]   = useState(false)
  const [dragError, setDragError] = useState(false)

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return

    const items = Array.from(e.dataTransfer.items || [])
    const files = Array.from(e.dataTransfer.files || [])

    // Check if a directory was dropped
    const hasDir = items.some((it) => {
      const entry = it.webkitGetAsEntry?.()
      return entry?.isDirectory
    })

    if (hasDir) {
      // Recursively read folder entries
      const allFiles = []
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) await collectFiles(entry, allFiles)
      }
      if (allFiles.length > 0) {
        onFilesSelected(allFiles, 'folder')
      }
    } else if (files.length > 0) {
      onFilesSelected(files, 'files')
    } else {
      setDragError(true)
      setTimeout(() => setDragError(false), 2000)
    }
  }, [onFilesSelected, disabled])

  // Recursively collect File objects from a FileSystemEntry
  function collectFiles(entry, result) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => {
          // Preserve the relative path via webkitRelativePath shimming
          Object.defineProperty(f, 'webkitRelativePath', {
            value: entry.fullPath.replace(/^\//, ''),
            writable: false,
          })
          result.push(f)
          resolve()
        })
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const readAll = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) { resolve(); return }
            for (const child of entries) await collectFiles(child, result)
            readAll()
          })
        }
        readAll()
      } else {
        resolve()
      }
    })
  }

  const handleDragOver = (e) => { e.preventDefault(); if (!disabled) setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const hasFiles   = selectedFiles.length > 0
  const totalSize  = selectedFiles.reduce((s, f) => s + f.size, 0)
  const folderName = getRootFolderName(selectedFiles)

  return (
    <div className="space-y-3">
      {/* Drop target */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={clsx(
          'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200',
          dragging   && !disabled && 'border-brand-400 bg-brand-500/5 scale-[1.005]',
          dragError  && 'border-status-error/50 bg-status-error/5',
          !dragging  && !dragError && hasFiles  && 'border-brand-500/40 bg-brand-500/5',
          !dragging  && !dragError && !hasFiles && 'border-surface-border',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >

            {/* Hidden inputs */}
        <input ref={fileInputRef}   type="file" multiple  className="hidden"
          onChange={(e) => { if (e.target.files?.length) onFilesSelected(e.target.files, 'files') }}
          disabled={disabled} />
        <input ref={folderInputRef} type="file" className="hidden"
          // @ts-ignore — non-standard but broadly supported
          webkitdirectory="true" mozdirectory="true" directory="true"
          onChange={(e) => { if (e.target.files?.length) onFilesSelected(e.target.files, 'folder') }}
          disabled={disabled} />


        {hasFiles ? (
          <div className="space-y-1.5">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
              {folderName ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            <p className="font-semibold text-ink">
              {folderName
                ? `📁 ${folderName}`
                : `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} selected`}
            </p>
            <p className="text-xs text-ink-muted font-mono">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
            </p>
            {!disabled && (
              <p className="text-xs text-ink-faint mt-1">Drag new files/folder here to replace</p>
            )}
          </div>
        ) : (
          <div className="space-y-2 pointer-events-none">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-muted text-ink-faint flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
            </div>
            <p className="font-semibold text-ink">
              {dragging ? 'Drop here' : 'Drag files or a folder here'}
            </p>
            <p className="text-xs text-ink-muted">or use the buttons below</p>
          </div>
        )}
      </div>

      {/* Picker buttons */}
      {!disabled && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary justify-center py-2.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Select Files
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="btn-secondary justify-center py-2.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
            Select Folder
          </button>
        </div>
      )}
    </div>
  )
}