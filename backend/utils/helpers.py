import random
import string


def generate_collection_name(prefix: str = "research_papers") -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}_{suffix}"
