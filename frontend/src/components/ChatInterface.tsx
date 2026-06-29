"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageStream, ChatResponse, suggestQuestions } from "@/lib/api";
import MessageBubble from "./MessageBubble";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
  images?: ChatResponse["images"];
}

interface ChatInterfaceProps {
  sessionId: string | null;
}

const HISTORY_KEY = "research-rag-history";

function loadHistory(sessionId: string): Message[] {
  try {
    const stored = localStorage.getItem(`${HISTORY_KEY}-${sessionId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveHistory(sessionId: string, messages: Message[]) {
  try {
    localStorage.setItem(`${HISTORY_KEY}-${sessionId}`, JSON.stringify(messages));
    const index: Record<string, { updatedAt: number; preview: string }> = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || "{}"
    );
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    index[sessionId] = {
      updatedAt: Date.now(),
      preview: lastUser?.content.slice(0, 80) || "New session",
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(index));
  } catch {}
}

function exportAsMarkdown(messages: Message[]): string {
  let md = "# Research RAG — Chat Export\n\n";
  md += `_Exported ${new Date().toLocaleString()}_\n\n---\n\n`;
  for (const msg of messages) {
    md += msg.role === "user" ? "## You\n\n" : "## Assistant\n\n";
    md += msg.content + "\n\n";
    if (msg.sources?.length) {
      md += "**Sources:**\n";
      const unique = Array.from(
        new Map(msg.sources.map((s) => [`${s.source}-${s.page}`, s])).values()
      );
      for (const s of unique) {
        md += `- ${s.source}, p.${s.page} (${s.content_type})\n`;
      }
      md += "\n";
    }
    md += "---\n\n";
  }
  return md;
}

export default function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    const stored = loadHistory(sessionId);
    if (stored.length > 0) {
      setMessages(stored);
    } else {
      const welcome: Message = {
        role: "assistant",
        content:
          "Your papers are indexed and ready. Ask me anything — I can search across text, tables, and figures.",
      };
      setMessages([welcome]);
    }
    setSuggestionsLoading(true);
    suggestQuestions(sessionId).then((q) => {
      setSuggestions(q);
      setSuggestionsLoading(false);
    });
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && messages.length > 0) {
      saveHistory(sessionId, messages);
    }
  }, [messages, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, streamingContent]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSubmit = async (query?: string) => {
    const q = (query || input).trim();
    if (!q || !sessionId || isLoading) return;

    setInput("");
    setSuggestions([]);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setIsLoading(true);
    setStreamingContent("");

    let fullAnswer = "";
    let sources: ChatResponse["sources"] = [];
    let images: ChatResponse["images"] = [];

    try {
      await sendMessageStream(sessionId, q, {
        onToken: (token) => {
          fullAnswer += token;
          setStreamingContent((prev) => prev + token);
        },
        onSources: (s, i) => {
          sources = s;
          images = i;
        },
        onDone: () => {},
        onError: (err) => {
          fullAnswer = `Something went wrong: ${err}. Please try again.`;
        },
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullAnswer, sources, images },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      textareaRef.current?.focus();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExport = () => {
    const md = exportAsMarkdown(messages);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      {messages.length > 1 && (
        <div className="flex items-center justify-end px-4 sm:px-6 py-2 border-b border-zinc-100 dark:border-zinc-900">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export as Markdown
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-1">
          {messages.map((msg, i) => (
            <div key={i} className="animate-fade-in" style={{ animationDelay: i === 0 ? "0ms" : "50ms" }}>
              <MessageBubble message={msg} />
            </div>
          ))}
          {isLoading && streamingContent && (
            <div className="animate-fade-in">
              <MessageBubble
                message={{ role: "assistant", content: streamingContent }}
                isStreaming
              />
            </div>
          )}
          {isLoading && !streamingContent && (
            <div className="flex gap-3.5 py-5 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/20">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested questions */}
      {suggestions.length > 0 && messages.length <= 1 && !isLoading && (
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-2">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2 uppercase tracking-wider font-medium">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSubmit(q)}
                className="text-[13px] px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all animate-fade-in"
                style={{ animationDelay: `${i * 75}ms` }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestionsLoading && messages.length <= 1 && (
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-2">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-36 rounded-xl bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <form onSubmit={handleFormSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                sessionId
                  ? "Ask about your research papers..."
                  : "Upload documents first..."
              }
              disabled={!sessionId || isLoading}
              rows={1}
              className="w-full resize-none rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 disabled:opacity-50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={!sessionId || isLoading || !input.trim()}
              className="absolute right-2 bottom-2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 dark:disabled:text-zinc-600 rounded-xl transition-all disabled:cursor-not-allowed active:scale-95 shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </form>
          <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 mt-2">
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
