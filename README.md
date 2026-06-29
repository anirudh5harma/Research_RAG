# Research Paper Assistant

RAG-based research assistant. Upload PDFs, ask questions about text, tables, and figures.

## Architecture

| Layer | Stack |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11 |
| LLM | OpenAI GPT-4o-mini (chat), GPT-4o (vision) |
| Embeddings | text-embedding-3-small |
| Vector DB | Qdrant (cloud or in-memory) |
| PDF parsing | PyMuPDF, pdfplumber |
| Image processing | OpenCV, Pillow |
| Orchestration | LangChain 0.3.x |

## Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn main:app --reload
```

Runs at `http://localhost:8000`. API docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Runs at `http://localhost:3000`.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/upload` | Upload PDFs (multipart) |
| POST | `/api/chat` | Send query (JSON) |
| DELETE | `/api/session/{id}` | Cleanup session |

## Deploy

- **Frontend → Vercel**: `cd frontend && vercel`
- **Backend → Render**: Connect repo, use `render.yaml`

Set `NEXT_PUBLIC_API_URL` in Vercel to your Render backend URL.
Set `FRONTEND_URL` in Render to your Vercel frontend URL.

## Features

- Text extraction via PyMuPDF
- Table extraction — hybrid PyMuPDF + pdfplumber with noise filtering
- Image awareness — GPT-4o vision describes extracted figures
- Vector search via Qdrant with text-embedding-3-small
- Conversational RAG with history-aware retrieval
- Source citations with page numbers
- Inline image display from retrieved context
