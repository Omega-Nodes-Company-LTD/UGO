"""Real Ollama embeddings shared by reflection and audio ingest."""

from __future__ import annotations

import httpx

from .config import JobsConfig


def embed(cfg: JobsConfig, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    response = httpx.post(
        f"{cfg.ollama_url}/api/embed",
        json={"model": cfg.ollama_embed_model, "input": texts},
        timeout=300,
    )
    response.raise_for_status()
    return response.json()["embeddings"]
