const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface UploadResponse {
  session_id: string;
  documents_processed: number;
  chunks_indexed: number;
  message: string;
}

interface UploadStartResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface UploadStatusResponse {
  job_id: string;
  status: string;
  message: string;
  session_id?: string | null;
  documents_processed?: number | null;
  chunks_indexed?: number | null;
  error?: string | null;
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

const POLL_INTERVAL_MS = 2000;
const MAX_UPLOAD_WAIT_MS = 15 * 60 * 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startUploadDocuments(files: File[]): Promise<UploadStartResponse> {
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

export async function getUploadStatus(jobId: string): Promise<UploadStatusResponse> {
  const res = await fetch(`${API_URL}/api/upload/${jobId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to fetch upload status");
  }

  return res.json();
}

export async function uploadDocuments(
  files: File[],
  onStatus?: (status: UploadStatusResponse) => void
): Promise<UploadResponse> {
  const started = await startUploadDocuments(files);
  const beganAt = Date.now();

  onStatus?.({
    job_id: started.job_id,
    status: started.status,
    message: started.message,
  });

  while (Date.now() - beganAt < MAX_UPLOAD_WAIT_MS) {
    await wait(POLL_INTERVAL_MS);
    const status = await getUploadStatus(started.job_id);
    onStatus?.(status);

    if (status.status === "completed") {
      if (!status.session_id || status.documents_processed == null || status.chunks_indexed == null) {
        throw new Error("Upload completed without session details");
      }
      return {
        session_id: status.session_id,
        documents_processed: status.documents_processed,
        chunks_indexed: status.chunks_indexed,
        message: status.message,
      };
    }

    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Upload failed");
    }
  }

  throw new Error("Upload is taking too long. Please try again.");
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

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onSources: (sources: ChatResponse["sources"], images: ChatResponse["images"]) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function sendMessageStream(
  sessionId: string,
  query: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    callbacks.onError(err.detail || "Chat failed");
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        switch (eventType) {
          case "token":
            callbacks.onToken(data.token);
            break;
          case "sources":
            callbacks.onSources(data.sources, data.images);
            break;
          case "done":
            callbacks.onDone();
            break;
          case "error":
            callbacks.onError(data.detail);
            break;
        }
        eventType = "";
      }
    }
  }
}

export async function suggestQuestions(sessionId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/api/suggest-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.questions || [];
  } catch {
    return [];
  }
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
