"use client";

import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import ChatInterface from "@/components/ChatInterface";
import { uploadDocuments, deleteSession } from "@/lib/api";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    setError(null);

    try {
      const response = await uploadDocuments(files);
      setSessionId(response.session_id);
      setUploadInfo(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleNewSession = async () => {
    if (sessionId) {
      await deleteSession(sessionId);
    }
    setSessionId(null);
    setUploadInfo(null);
    setError(null);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } transition-all duration-300 overflow-hidden border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col`}
      >
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold">Research RAG</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <FileUpload
            onUpload={handleUpload}
            isUploading={isUploading}
            isProcessed={!!sessionId}
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {uploadInfo && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
              {uploadInfo}
            </div>
          )}

          {sessionId && (
            <button
              onClick={handleNewSession}
              className="mt-4 w-full py-2 px-4 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              New Session
            </button>
          )}
        </div>

        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
          Research Paper Assistant v2.0
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex-1 flex flex-col">
          {!sessionId ? (
            <div className="flex-1 flex items-center justify-center text-neutral-400">
              <div className="text-center space-y-3">
                <svg
                  className="mx-auto h-16 w-16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-lg">Upload research papers to get started</p>
                <p className="text-sm">
                  PDF files with text, tables, and figures supported
                </p>
              </div>
            </div>
          ) : (
            <ChatInterface sessionId={sessionId} />
          )}
        </div>
      </div>
    </div>
  );
}
