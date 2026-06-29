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
}

export default function MessageBubble({ message }: MessageProps) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";

  const uniqueSources = message.sources
    ? Array.from(
        new Map(
          message.sources.map((s) => [`${s.source}-${s.page}`, s])
        ).values()
      )
    : [];

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {isUser ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-p:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.images && message.images.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.images.map((img, i) => (
              <div key={i} className="rounded-lg overflow-hidden">
                <img
                  src={`data:image/${img.ext};base64,${img.base64}`}
                  alt={img.caption}
                  className="max-w-full rounded-lg"
                />
                <p className="text-xs mt-1 opacity-70">
                  {img.source} — page {img.page}
                </p>
              </div>
            ))}
          </div>
        )}

        {uniqueSources.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="text-xs opacity-70 hover:opacity-100 transition-opacity flex items-center gap-1"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showSources ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {uniqueSources.length} source{uniqueSources.length > 1 ? "s" : ""}
            </button>
            {showSources && (
              <div className="mt-1 space-y-1">
                {uniqueSources.map((s, i) => (
                  <div
                    key={i}
                    className="text-xs opacity-60 pl-4"
                  >
                    {s.source} — p.{s.page} ({s.content_type})
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
