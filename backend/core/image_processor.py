import base64
import io
import logging
from typing import List

from langchain_core.documents import Document
from openai import OpenAI

from config.settings import OPENAI_API_KEY, IMAGE_DESCRIPTION_MODEL

logger = logging.getLogger(__name__)

_PROMPT = (
    "You are analysing a figure extracted from a research paper. "
    "Describe the figure in detail. Include:\n"
    "- The type of visualisation (bar chart, line graph, table, diagram, photo, etc.)\n"
    "- All axis labels, legends, and data series\n"
    "- Key trends, comparisons, or findings visible in the figure\n"
    "- Any text or annotations present in the image\n"
    "Be precise and factual. Do not speculate beyond what is visible."
)


def describe_images(documents: List[Document]) -> List[Document]:
    if not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — skipping image descriptions")
        return documents

    client = OpenAI(api_key=OPENAI_API_KEY)
    enriched: List[Document] = []

    for doc in documents:
        if doc.metadata.get("content_type") != "image" or "image_bytes" not in doc.metadata:
            enriched.append(doc)
            continue

        image_bytes = doc.metadata["image_bytes"]
        ext = doc.metadata.get("image_ext", "png")

        try:
            preprocessed = _preprocess_image(image_bytes)
            b64 = base64.b64encode(preprocessed).decode("utf-8")
            data_uri = f"data:image/{ext};base64,{b64}"

            response = client.chat.completions.create(
                model=IMAGE_DESCRIPTION_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _PROMPT},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }],
                max_tokens=500,
            )

            description = response.choices[0].message.content.strip()
            enriched.append(Document(
                page_content=f"{doc.page_content}\n\n{description}",
                metadata=doc.metadata,
            ))
            logger.info("Described image %d from %s p.%s (%d chars)",
                        doc.metadata.get("image_index", "?"),
                        doc.metadata.get("source", "?"),
                        doc.metadata.get("page", "?"),
                        len(description))

        except Exception as e:
            logger.error("Failed to describe image: %s", e)
            enriched.append(doc)

    return enriched


def _preprocess_image(image_bytes: bytes) -> bytes:
    try:
        import cv2
        import numpy as np

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return image_bytes

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if gray.std() < 40:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
            img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        _, buf = cv2.imencode(".png", img)
        return buf.tobytes()

    except (ImportError, Exception):
        return image_bytes
