"use client";

import { useState, useEffect } from "react";
import FileUpload from "@/components/FileUpload";
import ChatInterface from "@/components/ChatInterface";
import { uploadDocuments, deleteSession, type UploadStatusResponse } from "@/lib/api";

type ProcessingStep = "idle" | "uploading" | "extracting" | "indexing" | "done";

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: "",
  uploading: "Uploading and queueing files...",
  extracting: "Extracting and analyzing paper content...",
  indexing: "Building search index...",
  done: "Ready to chat!",
};

function mapUploadStatusToStep(status: UploadStatusResponse["status"]): ProcessingStep {
  switch (status) {
    case "queued":
      return "uploading";
    case "extracting":
    case "describing_images":
      return "extracting";
    case "indexing":
      return "indexing";
    case "completed":
      return "done";
    default:
      return "idle";
  }
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fileCount, setFileCount] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [nonResearchWarnings, setNonResearchWarnings] = useState<string[]>([]);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const isProcessing = processingStep !== "idle" && processingStep !== "done";

  const handleUpload = async (files: File[]) => {
    setError(null);
    setFileCount(files.length);

    try {
      setProcessingStep("uploading");
      const response = await uploadDocuments(files, (status) => {
        const nextStep = mapUploadStatusToStep(status.status);
        if (nextStep !== "idle") {
          setProcessingStep(nextStep);
        }
      });
      setProcessingStep("done");
      setSessionId(response.session_id);
      setUploadInfo(response.message);
      setNonResearchWarnings(response.non_research_warnings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProcessingStep("idle");
    }
  };

  const handleNewSession = async () => {
    if (sessionId) {
      await deleteSession(sessionId);
    }
    setSessionId(null);
    setUploadInfo(null);
    setError(null);
    setProcessingStep("idle");
    setNonResearchWarnings([]);
    setFileCount(0);
  };

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-[85vw] max-w-80 transition-transform duration-300
          md:static md:z-auto md:w-80 md:max-w-none md:translate-x-0
          border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col
          bg-[var(--sidebar-bg)]
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="h-[18px] w-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h1 className="text-[15px] font-semibold tracking-tight">Research RAG</h1>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Paper analysis assistant</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors md:hidden"
            >
              <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <FileUpload
            onUpload={handleUpload}
            isUploading={isProcessing}
            isProcessed={!!sessionId}
          />

          {/* Processing steps */}
          {isProcessing && (
            <div className="space-y-2.5 px-1 animate-fade-in">
              {(["uploading", "extracting", "indexing"] as const).map((step, idx) => {
                const stepOrder = { idle: 0, uploading: 1, extracting: 2, indexing: 3, done: 4 };
                const isActive = step === processingStep;
                const isDone = stepOrder[step] < stepOrder[processingStep];

                return (
                  <div
                    key={step}
                    className="flex items-center gap-2.5 text-xs"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    {isDone ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 flex items-center justify-center">
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                      </div>
                    )}
                    <span className={
                      isActive ? "text-zinc-900 dark:text-zinc-100 font-medium" :
                      isDone ? "text-zinc-400 dark:text-zinc-500" :
                      "text-zinc-300 dark:text-zinc-600"
                    }>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/30 rounded-xl text-[13px] text-red-600 dark:text-red-400 flex items-start gap-2 animate-fade-in">
              <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {error}
            </div>
          )}

          {uploadInfo && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/30 rounded-xl text-[13px] text-emerald-600 dark:text-emerald-400 flex items-start gap-2 animate-fade-in">
              <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {uploadInfo}
            </div>
          )}

          {nonResearchWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30 rounded-xl text-[13px] text-amber-600 dark:text-amber-400 flex items-start gap-2 animate-fade-in">
              <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>
                {nonResearchWarnings.length === 1
                  ? `${nonResearchWarnings[0]} may not be a research paper.`
                  : `${nonResearchWarnings.join(", ")} may not be research papers.`
                } Results work best with academic papers.
              </span>
            </div>
          )}

          {sessionId && (
            <button
              onClick={handleNewSession}
              className="w-full py-2.5 px-4 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-[13px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New session
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-600">Research RAG v2.0</span>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>
          </div>
          {sessionId && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {fileCount} PDF{fileCount !== 1 ? "s" : ""} loaded
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-white dark:bg-zinc-950">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all md:hidden"
          >
            <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}

        {!sessionId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-8 animate-fade-in">
              <div className="space-y-4">
                <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-purple-500/10 dark:from-indigo-500/15 dark:via-violet-500/15 dark:to-purple-500/15 flex items-center justify-center ring-1 ring-indigo-500/10">
                  <svg className="h-9 w-9 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Upload research papers
                  </h2>
                  <p className="mt-2 text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
                    Drop your PDFs in the sidebar and ask questions across all your papers.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                    title: "Text & tables",
                    desc: "Full extraction with table parsing",
                  },
                  {
                    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
                    title: "Figures",
                    desc: "AI-powered image analysis",
                  },
                  {
                    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
                    title: "Citations",
                    desc: "Answers with source pages",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 text-left hover:border-indigo-200 dark:hover:border-indigo-800/50 transition-colors group"
                  >
                    <svg className="h-5 w-5 text-indigo-500/70 group-hover:text-indigo-500 transition-colors mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                    </svg>
                    <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{feature.title}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ChatInterface sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}
