const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface UploadResponse {
  session_id: string;
  documents_processed: number;
  chunks_indexed: number;
  message: string;
  non_research_warnings?: string[];
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
  non_research_warnings?: string[] | null;
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
const POLL_RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readErrorDetail(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  return err.detail || "Request failed";
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function startUploadDocuments(files: File[]): Promise<UploadStartResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await readErrorDetail(res));
  }

  return res.json();
}

export async function getUploadStatus(jobId: string): Promise<UploadStatusResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= POLL_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/upload/${jobId}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await readErrorDetail(res);
        if (shouldRetryStatus(res.status) && attempt < POLL_RETRY_DELAYS_MS.length) {
          await wait(POLL_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new Error(detail || "Failed to fetch upload status");
      }

      return res.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to fetch upload status");
      if (attempt >= POLL_RETRY_DELAYS_MS.length) {
        break;
      }
      await wait(POLL_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError || new Error("Failed to fetch upload status");
}

export async function uploadDocuments(
  files: File[],
  onStatus?: (status: UploadStatusResponse) => void
): Promise<UploadResponse> {
  const started = await startUploadDocuments(files);
  const beganAt = Date.now();
  let consecutivePollFailures = 0;
  let latestStatus: UploadStatusResponse = {
    job_id: started.job_id,
    status: started.status,
    message: started.message,
  };

  onStatus?.(latestStatus);

  while (Date.now() - beganAt < MAX_UPLOAD_WAIT_MS) {
    await wait(POLL_INTERVAL_MS);
    let status: UploadStatusResponse;

    try {
      status = await getUploadStatus(started.job_id);
      consecutivePollFailures = 0;
      latestStatus = status;
      onStatus?.(status);
    } catch (error) {
      consecutivePollFailures += 1;

      if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw error instanceof Error ? error : new Error("Failed to fetch upload status");
      }

      onStatus?.({
        ...latestStatus,
        message: "Connection hiccup while tracking upload. Retrying...",
      });
      continue;
    }

    if (status.status === "completed") {
      if (!status.session_id || status.documents_processed == null || status.chunks_indexed == null) {
        throw new Error("Upload completed without session details");
      }
      return {
        session_id: status.session_id,
        documents_processed: status.documents_processed,
        chunks_indexed: status.chunks_indexed,
        message: status.message,
        non_research_warnings: status.non_research_warnings || undefined,
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
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const lines = event.split("\n");
      let eventType = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr += line.slice(6);
        }
      }
      if (!eventType || !dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
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
      } catch {
        // partial JSON, skip
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
