import io
import re
import logging
import fitz
import pdfplumber
import pandas as pd
from typing import List
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from config.settings import (
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    MIN_IMAGE_DIMENSION,
    ADVANCED_EXTRACTION_MAX_FILE_BYTES,
    ADVANCED_EXTRACTION_MAX_PAGES,
    MAX_IMAGES_PER_PDF,
)

logger = logging.getLogger(__name__)


def get_pdf_documents(pdf_files: list[tuple[str, bytes]]) -> List[Document]:
    documents: List[Document] = []
    for filename, pdf_bytes in pdf_files:
        page_count = _get_page_count(pdf_bytes, filename)
        text_docs = _extract_text(io.BytesIO(pdf_bytes), filename, page_count)

        allow_advanced = _should_run_advanced_extraction(pdf_bytes, page_count)
        table_docs: List[Document] = []
        image_docs: List[Document] = []
        if allow_advanced:
            table_docs = _extract_tables(pdf_bytes, filename)
            image_docs = _extract_images(io.BytesIO(pdf_bytes), filename)
        else:
            logger.warning(
                "Skipping advanced extraction for %s (%d bytes, %d pages) to keep processing stable",
                filename,
                len(pdf_bytes),
                page_count,
            )

        documents.extend(text_docs)
        documents.extend(table_docs)
        documents.extend(image_docs)
        logger.info("%s — %d text pages, %d tables, %d images",
                    filename, len(text_docs), len(table_docs), len(image_docs))
    return documents


def _get_page_count(pdf_bytes: bytes, filename: str) -> int:
    try:
        pdf = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
        page_count = len(pdf)
        pdf.close()
        return page_count
    except Exception as exc:
        logger.warning("Could not determine page count for %s: %s", filename, exc)
        return 0


def _should_run_advanced_extraction(pdf_bytes: bytes, page_count: int) -> bool:
    if len(pdf_bytes) > ADVANCED_EXTRACTION_MAX_FILE_BYTES:
        return False
    if page_count and page_count > ADVANCED_EXTRACTION_MAX_PAGES:
        return False
    return True


def _extract_text(pdf_stream: io.BytesIO, filename: str, page_count: int = 0) -> List[Document]:
    pdf = fitz.open(stream=pdf_stream, filetype="pdf")
    documents: List[Document] = []
    total_pages = page_count or len(pdf)
    for page_num, page in enumerate(pdf):
        text = page.get_text("text")
        if not text.strip():
            continue
        documents.append(Document(
            page_content=text,
            metadata={
                "source": filename,
                "page": page_num + 1,
                "content_type": "text",
                "total_pages": total_pages,
            },
        ))
    return documents


def _extract_tables(pdf_bytes: bytes, filename: str) -> List[Document]:
    documents: List[Document] = []
    table_counter = 0

    pymupdf_pdf = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
    pages_with_tables: set = set()

    for page_num, page in enumerate(pymupdf_pdf):
        page_text = page.get_text("text") or ""
        for tab in page.find_tables().tables:
            df = tab.to_pandas()
            if df.empty or df.shape[1] < 2 or df.shape[0] < 1 or _is_noise(df):
                continue
            pages_with_tables.add(page_num)
            table_counter += 1
            caption = _find_table_caption(page_text, table_counter)
            markdown_table = df.to_markdown(index=False)
            content = f"Table {table_counter}"
            if caption:
                content += f": {caption}"
            content += f"\n\n{_build_table_summary(markdown_table)}\n\n{markdown_table}"
            documents.append(Document(
                page_content=content,
                metadata={
                    "source": filename,
                    "page": page_num + 1,
                    "content_type": "table",
                    "table_number": table_counter,
                    "format": "markdown",
                    "extraction_method": "pymupdf",
                },
            ))

    _PLUMBER_STRATEGIES = [
        {"vertical_strategy": "lines_strict", "horizontal_strategy": "lines_strict"},
        {"vertical_strategy": "lines", "horizontal_strategy": "lines"},
        {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "min_words_vertical": 2,
            "min_words_horizontal": 2,
        },
    ]

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            if page_num in pages_with_tables:
                continue
            page_text = page.extract_text() or ""
            found_tables: list = []
            for settings in _PLUMBER_STRATEGIES:
                valid = [t for t in page.extract_tables(table_settings=settings)
                         if _looks_like_real_table(t)]
                if valid:
                    found_tables = valid
                    break
            for table_data in found_tables:
                header = table_data[0]
                rows = table_data[1:]
                if not header or len(header) < 2 or len(rows) < 1:
                    continue
                df = pd.DataFrame(rows, columns=header)
                if _is_noise(df):
                    continue
                table_counter += 1
                caption = _find_table_caption(page_text, table_counter)
                markdown_table = df.to_markdown(index=False)
                content = f"Table {table_counter}"
                if caption:
                    content += f": {caption}"
                content += f"\n\n{_build_table_summary(markdown_table)}\n\n{markdown_table}"
                documents.append(Document(
                    page_content=content,
                    metadata={
                        "source": filename,
                        "page": page_num + 1,
                        "content_type": "table",
                        "table_number": table_counter,
                        "format": "markdown",
                        "extraction_method": "pdfplumber",
                    },
                ))

    return documents


def _find_table_caption(page_text: str, table_number: int) -> str:
    patterns = [
        rf"[Tt]able\s*{table_number}\s*[:\.\-–—]\s*(.+)",
        rf"[Tt]able\s*{table_number}\s+(.+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, page_text)
        if match:
            return match.group(1).strip().split(".")[0].strip()
    return ""


def _build_table_summary(markdown_table: str) -> str:
    lines = [line.strip() for line in markdown_table.splitlines() if line.strip()]
    if not lines:
        return "[Table Summary: Table with columns unknown columns across 0 rows]"

    headers = [cell or "unnamed column" for cell in _split_markdown_row(lines[0])]
    if not headers:
        headers = ["unknown columns"]

    data_rows = 0
    for line in lines[1:]:
        cells = _split_markdown_row(line)
        if not cells or _is_markdown_separator_row(cells):
            continue
        data_rows += 1

    return (
        f"[Table Summary: Table with columns {', '.join(headers)} "
        f"across {data_rows} rows]"
    )


def _split_markdown_row(row: str) -> list[str]:
    return [cell.strip() for cell in row.strip().strip("|").split("|")]


def _is_markdown_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.match(r"^:?-{3,}:?$", cell) for cell in cells if cell)


def _looks_like_real_table(table_data: list) -> bool:
    if not table_data or len(table_data) < 3:
        return False
    header = table_data[0]
    if not header or len(header) < 2:
        return False
    if all(len(row) <= 1 for row in table_data):
        return False
    if max(len(row) for row in table_data) > 15:
        return False
    if len(table_data) > 50:
        return False
    non_empty = [h for h in header if h and str(h).strip()]
    if non_empty and sum(len(str(h)) for h in non_empty) / len(non_empty) > 40:
        return False
    if non_empty and len(non_empty) >= 4:
        short_headers = sum(1 for h in non_empty if len(str(h).strip()) <= 3)
        if short_headers / len(non_empty) > 0.4:
            return False
    first_col = [str(row[0]).strip() for row in table_data if row and row[0]]
    if sum(1 for v in first_col if re.match(r"^\[\d+\]$", v)) >= 3:
        return False
    words = " ".join(str(c) for row in table_data for c in row if c).split()
    if words and sum(1 for w in words if len(w) <= 1) / len(words) > 0.4:
        return False
    all_text = " ".join(str(c) for row in table_data for c in row if c)
    if len(all_text) > 0 and len(table_data) > 10:
        avg_cell_len = len(all_text) / sum(len(row) for row in table_data if row)
        if avg_cell_len < 3:
            return False
    if non_empty and len(non_empty) >= 5:
        joined = "".join(str(h).strip() for h in non_empty)
        spaces_in_headers = sum(1 for h in non_empty if " " in str(h).strip())
        if spaces_in_headers / len(non_empty) < 0.2 and len(joined) / len(non_empty) < 8:
            return False
        concat = " ".join(str(h).strip() for h in non_empty)
        lowered = sum(1 for h in non_empty if str(h).strip() and str(h).strip()[0].islower())
        if lowered / len(non_empty) > 0.5 and len(non_empty) >= 6:
            return False
    return True


def _is_noise(df: pd.DataFrame) -> bool:
    total = df.size
    if total == 0:
        return True
    empty = df.isna().sum().sum() + (df == "").sum().sum() + (df == "None").sum().sum()
    if empty / total > 0.7:
        return True
    if sum(len(str(v)) for v in df.values.flatten() if pd.notna(v)) < 30:
        return True
    if df.shape[0] > 50:
        return True
    col_names = [str(c) for c in df.columns]
    unnamed_count = sum(1 for c in col_names if c.startswith("Col") or c.startswith("unnamed"))
    if len(col_names) >= 4 and unnamed_count / len(col_names) > 0.5:
        return True
    return False


def _extract_images(pdf_stream: io.BytesIO, filename: str) -> List[Document]:
    from PIL import Image as PILImage

    pdf = fitz.open(stream=pdf_stream, filetype="pdf")
    documents: List[Document] = []
    image_counter = 0

    for page_num, page in enumerate(pdf):
        page_text = page.get_text("text") or ""
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            try:
                base_image = pdf.extract_image(xref)
            except Exception:
                continue
            image_bytes = base_image["image"]
            img = PILImage.open(io.BytesIO(image_bytes))
            w, h = img.size
            if w < MIN_IMAGE_DIMENSION or h < MIN_IMAGE_DIMENSION:
                continue
            image_counter += 1
            if image_counter > MAX_IMAGES_PER_PDF:
                logger.warning("Reached image extraction cap for %s (%d images)", filename, MAX_IMAGES_PER_PDF)
                return documents
            caption = _find_figure_caption(page_text, image_counter)
            content = f"[Figure {image_counter}"
            if caption:
                content += f": {caption}"
            content += f" — from {filename}, page {page_num + 1}]"
            documents.append(Document(
                page_content=content,
                metadata={
                    "source": filename,
                    "page": page_num + 1,
                    "content_type": "image",
                    "image_index": image_counter,
                    "image_bytes": image_bytes,
                    "image_ext": base_image.get("ext", "png"),
                    "width": w,
                    "height": h,
                },
            ))

    return documents


def _find_figure_caption(page_text: str, figure_number: int) -> str:
    patterns = [
        rf"[Ff]ig(?:ure)?\s*\.?\s*{figure_number}\s*[:\.\-–—]\s*(.+)",
        rf"[Ff]ig(?:ure)?\s*\.?\s*{figure_number}\s+(.+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, page_text)
        if match:
            return match.group(1).strip().split(".")[0].strip()
    return ""


def get_text_chunks_from_documents(documents: List[Document]) -> List[Document]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunked: List[Document] = []
    for doc in documents:
        ctype = doc.metadata.get("content_type")
        if ctype in ("table", "image"):
            chunked.append(doc)
            continue
        if not doc.page_content.strip():
            continue
        chunks = text_splitter.split_text(doc.page_content)
        for i, chunk_text in enumerate(chunks):
            if not chunk_text.strip():
                continue
            chunked.append(Document(
                page_content=chunk_text,
                metadata={**doc.metadata, "chunk": i + 1, "total_chunks": len(chunks)},
            ))
    return chunked
