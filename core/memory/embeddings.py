"""
Embeddings provider adapter.

Pluggable interface for generating text embeddings.
Currently supports OpenAI, with placeholder for local models.
"""

import os
import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""
    
    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        pass
    
    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        pass
    
    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Return the dimensionality of embeddings."""
        pass


class OpenAIEmbedding(EmbeddingProvider):
    """OpenAI embedding provider."""
    
    DIMENSIONS = {
        "text-embedding-3-small": 1536,
        "text-embedding-3-large": 3072,
        "text-embedding-ada-002": 1536,
    }
    
    def __init__(self, model: str = "text-embedding-3-small", api_key: Optional[str] = None):
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self._client: Optional["openai.AsyncOpenAI"] = None
        
    async def _get_client(self):
        if self._client is None:
            try:
                import openai
                self._client = openai.AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("openai package required. Install with: pip install openai")
        return self._client
    
    async def embed(self, text: str) -> list[float]:
        """Generate embedding for a single text using OpenAI."""
        client = await self._get_client()
        response = await client.embeddings.create(
            model=self.model,
            input=text,
        )
        return response.data[0].embedding
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts using OpenAI."""
        if not texts:
            return []
        client = await self._get_client()
        response = await client.embeddings.create(
            model=self.model,
            input=texts,
        )
        return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
    
    @property
    def dimensions(self) -> int:
        return self.DIMENSIONS.get(self.model, 1536)


class LocalEmbedding(EmbeddingProvider):
    """Placeholder for local embedding models (e.g., sentence-transformers)."""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None
        self._dimensions = 384
        
    async def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.model_name)
                self._dimensions = self._model.get_sentence_embedding_dimension()
            except ImportError:
                raise ImportError(
                    "sentence-transformers package required for local embeddings. "
                    "Install with: pip install sentence-transformers"
                )
        return self._model
    
    async def embed(self, text: str) -> list[float]:
        """Generate embedding using local model."""
        model = await self._get_model()
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts using local model."""
        if not texts:
            return []
        model = await self._get_model()
        embeddings = model.encode(texts, convert_to_numpy=True)
        return [e.tolist() for e in embeddings]
    
    @property
    def dimensions(self) -> int:
        return self._dimensions


def get_embedding_provider(model: str = "text-embedding-3-small") -> EmbeddingProvider:
    """
    Factory function to get the appropriate embedding provider.
    
    Args:
        model: Model identifier. Use 'openai/...' for OpenAI models,
               'local/...' for local models.
    
    Returns:
        EmbeddingProvider instance
    """
    if model.startswith("local/"):
        model_name = model.replace("local/", "")
        return LocalEmbedding(model_name)
    elif model.startswith("openai/"):
        model_name = model.replace("openai/", "")
        return OpenAIEmbedding(model_name)
    else:
        return OpenAIEmbedding(model)
