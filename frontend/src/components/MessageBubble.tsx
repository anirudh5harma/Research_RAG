"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageProps {
  message: {
    role: "user" | "assistant";
    content: string;
    sources?: Array<{
      source: string;
      page: number;
      content_type: string;
    }>;
    images?: Array<{
      base64: string;
      ext: string;
      source: string;
      page: number;
      caption: string;
    }>;
  };
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming }: MessageProps) {
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const uniqueSources = message.sources
    ? Array.from(
        new Map(
          message.sources.map((s) => [`${s.source}-${s.page}`, s])
        ).values()
      )
    : [];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-3.5 py-5 group/msg">
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
          isUser
            ? "bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-200/50 dark:ring-zinc-700/50"
            : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/20"
        }`}
      >
        {isUser ? (
          <svg
            className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            {isUser ? "You" : "Assistant"}
          </p>
          {!isUser && !isStreaming && message.content && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )}
            </button>
          )}
        </div>

        {isUser ? (
          <div className="text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100">
            {message.content}
          </div>
        ) : (
          <div className="text-[14px] leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-code:text-xs prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal prose-pre:bg-zinc-900 prose-pre:rounded-xl prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="min-w-full text-xs border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-zinc-50 dark:bg-zinc-900">{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/50">
                    {children}
                  </td>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    {children}
                  </tr>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-0.5 rounded-sm" />
            )}
          </div>
        )}

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="mt-4 grid gap-3">
            {message.images.map((img, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-zinc-900"
              >
                <img
                  src={`data:image/${img.ext};base64,${img.base64}`}
                  alt={img.caption}
                  className="max-w-full max-h-96 object-contain mx-auto"
                />
                <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 flex items-center gap-1.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5z" />
                  </svg>
                  {img.source} — page {img.page}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {uniqueSources.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowSources(!showSources)}
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
            >
              <svg
                className={`h-3 w-3 transition-transform duration-200 ${showSources ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {uniqueSources.length} source
              {uniqueSources.length > 1 ? "s" : ""}
            </button>
            {showSources && (
              <div className="mt-1.5 ml-1 space-y-1 border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 animate-fade-in">
                {uniqueSources.map((s, i) => (
                  <div
                    key={i}
                    className="text-[11px] text-zinc-500 flex items-center gap-2"
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                        s.content_type === "table"
                          ? "bg-amber-400"
                          : s.content_type === "image"
                            ? "bg-purple-400"
                            : "bg-indigo-400"
                      }`}
                    />
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {s.source}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-600">
                      p.{s.page}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">
                      {s.content_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
