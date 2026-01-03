"""
Utility functions for eval tests.
"""

import os
import asyncio
from typing import Optional, Any


async def call_model_async(
    prompt: str,
    model: str = None,
    temperature: float = 0.0,
    max_tokens: int = 1024,
) -> str:
    """
    Call the model with a prompt and return the response.
    
    Args:
        prompt: The prompt to send
        model: Model to use (defaults to EVAL_MODEL env var)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        
    Returns:
        The model's response text
    """
    model = model or os.environ.get("EVAL_MODEL", "gpt-4o-mini")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable not set")

    import openai

    try:
        client = openai.AsyncOpenAI(api_key=api_key)

        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )

        return response.choices[0].message.content or ""
    except Exception as e:
        raise RuntimeError(f"Model call failed: {e}")


def call_model(
    prompt: str,
    model: str = None,
    temperature: float = 0.0,
    max_tokens: int = 1024,
) -> str:
    """
    Synchronous wrapper for call_model_async.
    """
    return asyncio.get_event_loop().run_until_complete(
        call_model_async(prompt, model, temperature, max_tokens)
    )


def check_must_include(output: str, must_include: list[str] | str) -> tuple[bool, list[str]]:
    """
    Check if output contains required strings.
    
    Returns:
        Tuple of (passed, missing_items)
    """
    if isinstance(must_include, str):
        must_include = [must_include]
    
    missing = []
    for item in must_include:
        if item.lower() not in output.lower():
            missing.append(item)
    
    return len(missing) == 0, missing


def check_must_not_include(output: str, must_not_include: list[str]) -> tuple[bool, list[str]]:
    """
    Check if output does not contain forbidden strings.
    
    Returns:
        Tuple of (passed, found_forbidden)
    """
    found = []
    for item in must_not_include:
        if item.lower() in output.lower():
            found.append(item)
    
    return len(found) == 0, found


def diff_text(expected: str, actual: str) -> str:
    """
    Generate a simple text diff between expected and actual.
    """
    import difflib
    
    differ = difflib.unified_diff(
        expected.splitlines(keepends=True),
        actual.splitlines(keepends=True),
        fromfile='expected',
        tofile='actual',
    )
    
    return ''.join(differ)
