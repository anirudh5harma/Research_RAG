import uuid
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config.settings import APP_NAME, APP_VERSION, FRONTEND_URL
from core.pdf_processor import get_pdf_documents, get_text_chunks_from_documents
from core.image_processor import describe_images
from core.vector_store import get_qdrant_vectorstore
from core.rag_chain import get_context_retriever_chain, get_conversational_rag_chain
from utils.helpers import generate_collection_name

from langchain_core.messages import AIMessage, HumanMessage

logger = logging.getLogger(__name__)

SESSION_TTL = 3600 * 4
MAX_UPLOAD_SIZE = 50 * 1024 * 1024

sessions: dict = {}


def _cleanup_expired_sessions():
    now = time.time()
    expired = [k for k, v in sessions.items() if now - v.get("created_at", 0) > SESSION_TTL]
    for k in expired:
        del sessions[k]
    if expired:
        logger.info("Cleaned up %d expired sessions", len(expired))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("%s v%s starting", APP_NAME, APP_VERSION)
    yield
    sessions.clear()
    logger.info("Shutdown — sessions cleared")


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)

allowed_origins = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str
    query: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    images: list[dict]


class UploadResponse(BaseModel):
    session_id: str
    documents_processed: int
    chunks_indexed: int
    message: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_documents(files: list[UploadFile] = File(...)):
    _cleanup_expired_sessions()

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    for f in files:
        if not f.filename or not f.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Only PDF files accepted: {f.filename}")

    pdf_files = []
    total_size = 0
    for f in files:
        content = await f.read()
        total_size += len(content)
        if total_size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"Total upload exceeds {MAX_UPLOAD_SIZE // 1024 // 1024}MB limit")
        pdf_files.append((f.filename, content))

    docs = get_pdf_documents(pdf_files)
    if not docs:
        raise HTTPException(status_code=422, detail="No content extracted from PDFs")

    docs = describe_images(docs)
    chunked = get_text_chunks_from_documents(docs)

    collection = generate_collection_name()
    vectorstore, info = get_qdrant_vectorstore(chunked, collection)

    if vectorstore is None:
        raise HTTPException(status_code=500, detail="Failed to create vector store")

    session_id = str(uuid.uuid4())
    retriever = get_context_retriever_chain(vectorstore)
    rag_chain = get_conversational_rag_chain(retriever)

    sessions[session_id] = {
        "vectorstore": vectorstore,
        "rag_chain": rag_chain,
        "chat_history": [],
        "image_cache": {k: v for k, v in info.get("images", {}).items()} if isinstance(info.get("images"), dict) else {},
        "collection": collection,
        "created_at": time.time(),
    }

    return UploadResponse(
        session_id=session_id,
        documents_processed=len(pdf_files),
        chunks_indexed=info["indexed"],
        message=f"Processed {len(pdf_files)} PDF(s), indexed {info['indexed']} chunks",
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Upload documents first.")

    if not session["rag_chain"]:
        raise HTTPException(status_code=400, detail="RAG chain not initialized")

    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Empty query")

    try:
        result = session["rag_chain"].invoke({
            "chat_history": session["chat_history"],
            "input": req.query,
        })

        answer = result.get("answer", "")
        context_docs = result.get("context", [])

        session["chat_history"].append(HumanMessage(content=req.query))
        session["chat_history"].append(AIMessage(content=answer))

        sources = []
        images = []
        image_cache = session.get("image_cache", {})

        for doc in context_docs:
            source_info = {
                "source": doc.metadata.get("source", "unknown"),
                "page": doc.metadata.get("page", 0),
                "content_type": doc.metadata.get("content_type", "text"),
            }
            sources.append(source_info)

            if doc.metadata.get("content_type") == "image":
                cache_key = doc.metadata.get("image_cache_key")
                if cache_key and cache_key in image_cache:
                    cached = image_cache[cache_key]
                    images.append({
                        "base64": cached["base64"],
                        "ext": cached["ext"],
                        "source": doc.metadata.get("source", "unknown"),
                        "page": doc.metadata.get("page", 0),
                        "caption": doc.page_content,
                    })

        return ChatResponse(answer=answer, sources=sources, images=images)

    except Exception as e:
        logger.error("Chat error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    if session_id in sessions:
        del sessions[session_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/sessions")
async def list_sessions():
    return {
        "active_sessions": len(sessions),
        "session_ids": list(sessions.keys()),
    }
