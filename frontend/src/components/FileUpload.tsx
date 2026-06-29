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

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
          dragActive
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.02]"
            : isProcessed
            ? "border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-500/5"
            : "border-zinc-200 dark:border-zinc-700/80 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        }`}
        onClick={() =>
          !isProcessed && document.getElementById("file-input")?.click()
        }
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {isProcessed ? (
          <>
            <svg
              className="mx-auto h-8 w-8 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Documents processed
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-2">
              <svg
                className="h-5 w-5 text-indigo-500 dark:text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400">
              Drop PDFs here
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              or click to browse
            </p>
          </>
        )}
      </div>

      {files.length > 0 && !isProcessed && (
        <div className="space-y-2.5 animate-fade-in">
          <div className="space-y-1.5">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-xl px-3 py-2 group hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-red-500 dark:text-red-400">
                      PDF
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate text-zinc-700 dark:text-zinc-300">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
            <span>
              {files.length} file{files.length > 1 ? "s" : ""}
            </span>
            <span>{(totalSize / 1024 / 1024).toFixed(1)} MB total</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isUploading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/70 text-white rounded-xl font-medium transition-all text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-[0.98]"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                Process {files.length} PDF{files.length > 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
