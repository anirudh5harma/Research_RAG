import uuid
import time
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from config.settings import APP_NAME, APP_VERSION, FRONTEND_URL, AI_MODEL, LLM_TEMPERATURE
from utils.helpers import generate_collection_name

logger = logging.getLogger(__name__)

SESSION_TTL = 3600 * 4
MAX_UPLOAD_SIZE = 50 * 1024 * 1024

sessions: dict = {}
upload_jobs: dict = {}


def _normalise_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def _build_allowed_origins() -> list[str]:
    configured = [
        _normalise_origin(origin)
        for origin in FRONTEND_URL.split(",")
        if origin.strip()
    ]
    defaults = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://frontend-omega-snowy-40.vercel.app",
    ]

    allowed: list[str] = []
    for origin in [*configured, *defaults]:
        if origin and origin not in allowed:
            allowed.append(origin)
    return allowed


def _cleanup_expired_sessions():
    now = time.time()
    expired = [k for k, v in sessions.items() if now - v.get("created_at", 0) > SESSION_TTL]
    for k in expired:
        del sessions[k]
    if expired:
        logger.info("Cleaned up %d expired sessions", len(expired))


def _cleanup_expired_jobs():
    now = time.time()
    expired = [k for k, v in upload_jobs.items() if now - v.get("created_at", 0) > SESSION_TTL]
    for k in expired:
        del upload_jobs[k]
    if expired:
        logger.info("Cleaned up %d expired upload jobs", len(expired))


def _set_upload_job(job_id: str, **updates):
    upload_jobs.setdefault(job_id, {"job_id": job_id, "created_at": time.time()})
    upload_jobs[job_id].update(updates)
    upload_jobs[job_id]["updated_at"] = time.time()


def _process_upload_job(job_id: str, pdf_files: list[tuple[str, bytes]]):
    # These modules pull in the PDF, data-science, and LangChain stacks. Loading
    # them only for upload work keeps cold-start health checks lightweight.
    from core.image_processor import describe_images
    from core.pdf_processor import (
        get_pdf_documents,
        get_text_chunks_from_documents,
        validate_research_papers,
    )
    from core.rag_chain import (
        get_context_retriever_chain,
        get_conversational_rag_chain,
    )
    from core.vector_store import get_qdrant_vectorstore

    started_at = time.time()
    try:
        _set_upload_job(
            job_id,
            status="extracting",
            message="Extracting text, tables, and images from PDFs...",
        )
        docs = get_pdf_documents(pdf_files)
        if not docs:
            raise HTTPException(status_code=422, detail="No content extracted from PDFs")

        non_research = validate_research_papers(docs)
        if non_research:
            names = ", ".join(non_research)
            _set_upload_job(job_id, non_research_warnings=non_research)
            logger.warning("Files may not be research papers: %s", names)

        _set_upload_job(
            job_id,
            status="describing_images",
            message="Describing figures and enriching document content...",
        )
        docs = describe_images(docs)

        _set_upload_job(
            job_id,
            status="indexing",
            message="Building the vector index for retrieval...",
        )
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

        _set_upload_job(
            job_id,
            status="completed",
            message=f"Processed {len(pdf_files)} PDF(s), indexed {info['indexed']} chunks",
            session_id=session_id,
            documents_processed=len(pdf_files),
            chunks_indexed=info["indexed"],
        )
        logger.info("Upload job %s completed in %.2fs", job_id, time.time() - started_at)
    except HTTPException as exc:
        _set_upload_job(
            job_id,
            status="failed",
            message=exc.detail,
            error=exc.detail,
        )
        logger.warning("Upload job %s failed: %s", job_id, exc.detail)
    except Exception as exc:
        logger.exception("Upload job %s crashed", job_id)
        _set_upload_job(
            job_id,
            status="failed",
            message="Upload processing failed",
            error=str(exc),
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("%s v%s starting", APP_NAME, APP_VERSION)
    logger.info("CORS allowed origins: %s", allowed_origins)
    yield
    sessions.clear()
    upload_jobs.clear()
    logger.info("Shutdown — sessions cleared")


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)

allowed_origins = _build_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


class ChatRequest(BaseModel):
    session_id: str
    query: str


class SuggestRequest(BaseModel):
    session_id: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    images: list[dict]


class UploadResponse(BaseModel):
    session_id: str
    documents_processed: int
    chunks_indexed: int
    message: str


class UploadStartResponse(BaseModel):
    job_id: str
    status: str
    message: str


class UploadStatusResponse(BaseModel):
    job_id: str
    status: str
    message: str
    session_id: str | None = None
    documents_processed: int | None = None
    chunks_indexed: int | None = None
    error: str | None = None
    non_research_warnings: list[str] | None = None


@app.api_route(
    "/api/health",
    methods=["GET", "HEAD"],
    status_code=204,
    response_class=Response,
)
async def health() -> Response:
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@app.post("/api/upload", response_model=UploadStartResponse, status_code=202)
async def upload_documents(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)):
    _cleanup_expired_sessions()
    _cleanup_expired_jobs()

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

    job_id = str(uuid.uuid4())
    _set_upload_job(
        job_id,
        status="queued",
        message=f"Queued {len(pdf_files)} PDF(s) for processing",
    )
    background_tasks.add_task(_process_upload_job, job_id, pdf_files)

    logger.info("Accepted upload job %s with %d PDF(s)", job_id, len(pdf_files))
    return UploadStartResponse(
        job_id=job_id,
        status="queued",
        message="Upload accepted. Processing in background.",
    )


@app.get("/api/upload/{job_id}", response_model=UploadStatusResponse)
async def get_upload_status(job_id: str):
    _cleanup_expired_jobs()

    job = upload_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")

    return UploadStatusResponse(
        job_id=job_id,
        status=job.get("status", "queued"),
        message=job.get("message", "Processing upload"),
        session_id=job.get("session_id"),
        documents_processed=job.get("documents_processed"),
        chunks_indexed=job.get("chunks_indexed"),
        error=job.get("error"),
        non_research_warnings=job.get("non_research_warnings"),
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    from langchain_core.messages import AIMessage, HumanMessage

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


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    from langchain_core.messages import AIMessage, HumanMessage

    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Upload documents first.")

    if not session["rag_chain"]:
        raise HTTPException(status_code=400, detail="RAG chain not initialized")

    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Empty query")

    def event_generator():
        try:
            full_answer = ""
            context_docs = []

            for chunk in session["rag_chain"].stream({
                "chat_history": session["chat_history"],
                "input": req.query,
            }):
                if "context" in chunk:
                    context_docs = chunk["context"]
                if "answer" in chunk:
                    token = chunk["answer"]
                    full_answer += token
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

            session["chat_history"].append(HumanMessage(content=req.query))
            session["chat_history"].append(AIMessage(content=full_answer))

            content_types = [doc.metadata.get("content_type", "text") for doc in context_docs]
            logger.info("Stream context: %d docs, types: %s", len(context_docs), content_types)

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
                    logger.info("Image doc cache_key=%s, in_cache=%s, cache_keys=%s",
                                cache_key, cache_key in image_cache if cache_key else False,
                                list(image_cache.keys())[:5])
                    if cache_key and cache_key in image_cache:
                        cached = image_cache[cache_key]
                        images.append({
                            "base64": cached["base64"],
                            "ext": cached["ext"],
                            "source": doc.metadata.get("source", "unknown"),
                            "page": doc.metadata.get("page", 0),
                            "caption": doc.page_content,
                        })

            yield f"event: sources\ndata: {json.dumps({'sources': sources, 'images': images})}\n\n"
            yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"

        except Exception as e:
            logger.error("Stream error: %s", e)
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/suggest-questions")
async def suggest_questions(req: SuggestRequest):
    from langchain_openai import ChatOpenAI

    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        retriever = session["vectorstore"].as_retriever(search_kwargs={"k": 3})
        sample_docs = retriever.invoke("key findings methodology results")
        context_sample = "\n\n".join([d.page_content[:500] for d in sample_docs[:3]])

        llm = ChatOpenAI(model=AI_MODEL, temperature=0.7)
        response = llm.invoke(
            f"Based on these research paper excerpts, generate exactly 4 short questions "
            f"(max 10 words each) that a researcher would want to ask. "
            f"Return ONLY a JSON array of strings, no other text.\n\n{context_sample}"
        )

        questions = json.loads(response.content)
        return {"questions": questions[:4]}
    except Exception as e:
        logger.error("Suggest questions error: %s", e)
        return {"questions": [
            "What are the key findings?",
            "What methodology was used?",
            "What are the main conclusions?",
            "How does this compare to prior work?",
        ]}


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
