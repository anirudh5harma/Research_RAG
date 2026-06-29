"use client";

import { useState, useRef, useEffect } from "react";
import { sendMessage, ChatResponse } from "@/lib/api";
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

export default function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! Upload some research papers and ask me questions about them.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId || isLoading) return;

    const query = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setIsLoading(true);

    try {
      const response = await sendMessage(sessionId, query);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          images: response.images,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-neutral-500">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
            </div>
            <span className="text-sm">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              sessionId
                ? "Ask about your documents..."
                : "Upload documents first..."
            }
            disabled={!sessionId || isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!sessionId || isLoading || !input.trim()}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded-xl transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
