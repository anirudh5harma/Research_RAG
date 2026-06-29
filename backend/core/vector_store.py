import base64
import logging
from typing import Optional

import qdrant_client
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_core.documents import Document
from qdrant_client.http.models import VectorParams, Distance, PayloadSchemaType

from config.settings import OPENAI_API_KEY, QDRANT_HOST, QDRANT_API_KEY, EMBEDDING_MODEL

logger = logging.getLogger(__name__)


def get_qdrant_vectorstore(
    docs: list[Document],
    collection_name: str,
) -> tuple[Optional[QdrantVectorStore], dict]:
    info = {"indexed": 0, "images": []}

    embeddings = _init_embeddings()
    if not embeddings:
        return None, info

    vector_size = _get_vector_size(embeddings)
    if not vector_size:
        return None, info

    client = _init_qdrant_client()
    if not client:
        return None, info

    if not _ensure_collection(client, collection_name, vector_size):
        return None, info

    try:
        vs = QdrantVectorStore(
            client=client,
            collection_name=collection_name,
            embedding=embeddings,
        )
        if docs:
            indexable, image_cache = _prepare_docs_for_indexing(docs)
            vs.add_documents(indexable)
            info["indexed"] = len(indexable)
            info["images"] = image_cache
            logger.info("Indexed %d documents into '%s'", len(indexable), collection_name)
        return vs, info

    except Exception as e:
        logger.error("Failed to initialise vectorstore: %s", e)
        return None, info


def _init_embeddings() -> Optional[OpenAIEmbeddings]:
    if not OPENAI_API_KEY:
        logger.error("OpenAI API key not found")
        return None
    return OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY)


def _get_vector_size(embeddings: OpenAIEmbeddings) -> Optional[int]:
    try:
        return len(embeddings.embed_query("dimension probe"))
    except Exception as e:
        logger.error("Failed to get embedding dimension: %s", e)
        return None


def _init_qdrant_client() -> Optional[qdrant_client.QdrantClient]:
    if not QDRANT_HOST:
        logger.warning("No QDRANT_HOST — using in-memory Qdrant")
        return qdrant_client.QdrantClient(":memory:")

    try:
        kwargs = {
            "api_key": QDRANT_API_KEY,
            "timeout": 120.0,
            "prefer_grpc": False,
        }
        if QDRANT_HOST.startswith("http"):
            kwargs["url"] = QDRANT_HOST
        else:
            kwargs["host"] = QDRANT_HOST

        client = qdrant_client.QdrantClient(**kwargs)
        client.get_collections()
        return client

    except Exception as e:
        logger.error("Qdrant connection failed: %s", e)
        return None


def _ensure_collection(
    client: qdrant_client.QdrantClient,
    collection_name: str,
    vector_size: int,
) -> bool:
    try:
        client.get_collection(collection_name=collection_name)
        _ensure_payload_index(client, collection_name)
        return True
    except qdrant_client.http.exceptions.UnexpectedResponse:
        pass
    except Exception as e:
        logger.error("Error checking collection: %s", e)

    try:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
        _ensure_payload_index(client, collection_name)
        return True
    except Exception as e:
        logger.error("Failed to create collection '%s': %s", collection_name, e)
        return False


def _ensure_payload_index(client: qdrant_client.QdrantClient, collection_name: str):
    try:
        client.create_payload_index(
            collection_name=collection_name,
            field_name="metadata.content_type",
            field_schema=PayloadSchemaType.KEYWORD,
        )
    except Exception:
        pass


def _prepare_docs_for_indexing(docs: list[Document]) -> tuple[list[Document], dict]:
    image_cache: dict = {}
    prepared: list[Document] = []

    for i, doc in enumerate(docs):
        meta = dict(doc.metadata)
        meta["id"] = str(i)
        if "image_bytes" in meta:
            key = f"{meta.get('source', '')}_{meta.get('page', '')}_{meta.get('image_index', '')}"
            raw_bytes = meta.pop("image_bytes")
            ext = meta.get("image_ext", "png")
            image_cache[key] = {
                "base64": base64.b64encode(raw_bytes).decode("utf-8"),
                "ext": ext,
            }
            meta["image_cache_key"] = key
        prepared.append(Document(page_content=doc.page_content, metadata=meta))

    return prepared, image_cache
