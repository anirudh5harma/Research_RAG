const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface UploadResponse {
  session_id: string;
  documents_processed: number;
  chunks_indexed: number;
  message: string;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{
    source: string;
    page: number;
    content_type: string;
  }>;
  images: Array<{
    base64: string;
    ext: string;
    source: string;
    page: number;
    caption: string;
  }>;
}

export async function uploadDocuments(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }

  return res.json();
}

export async function sendMessage(
  sessionId: string,
  query: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Chat failed");
  }

  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${API_URL}/api/session/${sessionId}`, { method: "DELETE" });
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
