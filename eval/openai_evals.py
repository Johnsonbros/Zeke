"""Helpers for posting local eval results to OpenAI Evals."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, Optional


class OpenAIEvalsError(RuntimeError):
    """Raised when uploading to OpenAI Evals fails."""


@dataclass
class EvalUploadResult:
    run_id: str
    report_url: str
    status: str
    result_counts: Dict[str, Any]


def build_evaluation_guid(test_filter: Optional[str] = None) -> str:
    """Return an evaluation GUID using the recommended dotted format.

    The value can be overridden with the ``OPENAI_EVAL_GUID`` environment variable.
    When a test filter is provided we append it for easier disambiguation while
    preserving the dotted GUID style suggested in the OpenAI docs.
    """

    env_guid = os.environ.get("OPENAI_EVAL_GUID")
    if env_guid:
        return env_guid

    safe_filter = test_filter.replace(" ", "_") if test_filter else "all"
    return f"evals.zeke.pytests.{safe_filter}.v1"


def _serialize_summary(summary: dict) -> dict:
    """Prepare the summary payload for OpenAI Evals."""

    serialized = dict(summary)
    # Avoid accidentally uploading large binary blobs in the future.
    for key in ("stdout", "stderr"):
        if key in serialized and serialized[key] is None:
            serialized[key] = ""
    return serialized


def upload_eval_results(
    summary: dict,
    run_file: Path,
    test_filter: Optional[str] = None,
    ci_mode: bool = False,
    *,
    evaluation_guid: Optional[str] = None,
) -> EvalUploadResult:
    """Upload a completed eval run summary to OpenAI Evals.

    Args:
        summary: The run summary returned by :func:`run_evals`.
        run_file: Path to the JSON summary saved to disk.
        test_filter: Optional pytest ``-k`` filter used for the run.
        ci_mode: Whether the upload is being performed in CI.
        evaluation_guid: Optional override for the evaluation GUID.
    """

    try:
        import openai
    except Exception as exc:  # pragma: no cover - import guard
        raise OpenAIEvalsError("The 'openai' package is required to upload evals") from exc

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise OpenAIEvalsError("OPENAI_API_KEY not set; cannot upload eval results")

    client = openai.OpenAI(api_key=api_key)

    guid = evaluation_guid or build_evaluation_guid(test_filter)
    run_name = f"zeke-evals-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"

    data_source = {
        "type": "responses",
        "source": {
            "type": "file_content",
            "content": [
                {
                    "item": _serialize_summary(summary),
                    "sample": {
                        "run_file": str(run_file),
                        "ci_mode": ci_mode,
                        "metadata": {
                            "stdout": summary.get("stdout", ""),
                            "stderr": summary.get("stderr", ""),
                        },
                    },
                }
            ],
        },
    }

    response = client.evals.runs.create(
        eval_id=guid,
        data_source=data_source,
        name=run_name,
        metadata={
            "ci": str(ci_mode).lower(),
            "test_filter": test_filter or "all",
            "run_file": str(run_file.name),
        },
    )

    result = EvalUploadResult(
        run_id=response.id,
        report_url=response.report_url,
        status=response.status,
        result_counts={
            "passed": response.result_counts.passed,
            "failed": response.result_counts.failed,
            "errored": response.result_counts.errored,
            "total": response.result_counts.total,
        },
    )

    # Update the on-disk summary for traceability.
    updated_summary = dict(summary)
    updated_summary["openai_eval"] = asdict(result)
    with open(run_file, "w") as f:
        json.dump(updated_summary, f, indent=2)

    return result
