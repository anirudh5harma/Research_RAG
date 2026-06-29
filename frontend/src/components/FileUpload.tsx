"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
  isProcessed: boolean;
}

export default function FileUpload({
  onUpload,
  isUploading,
  isProcessed,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const pdfs = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf"
    );
    setFiles((prev) => [...prev, ...pdfs]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (files.length > 0) {
      onUpload(files);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-blue-500 bg-blue-500/10"
            : "border-neutral-300 dark:border-neutral-700 hover:border-blue-400"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <svg
          className="mx-auto h-12 w-12 text-neutral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Drop PDFs here or click to browse
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  className="h-4 w-4 text-red-500 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M4 18h12a2 2 0 002-2V6l-4-4H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm truncate">{file.name}</span>
                <span className="text-xs text-neutral-500">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="text-neutral-400 hover:text-red-500 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <button
            onClick={handleSubmit}
            disabled={isUploading || isProcessed}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded-lg font-medium transition-colors text-sm"
          >
            {isUploading
              ? "Processing..."
              : isProcessed
              ? "Documents Ready"
              : `Process ${files.length} PDF${files.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
