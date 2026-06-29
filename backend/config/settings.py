import os
import logging
from dotenv import load_dotenv

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

APP_NAME = "Research Paper Assistant"
APP_VERSION = "2.0.0"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QDRANT_HOST = os.getenv("QDRANT_HOST")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
LLM_TEMPERATURE = 0.2

EMBEDDING_MODEL = "text-embedding-3-small"

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
RETRIEVER_K = 5

MIN_IMAGE_DIMENSION = 100
IMAGE_DESCRIPTION_MODEL = os.getenv("IMAGE_DESCRIPTION_MODEL", "gpt-4o")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
