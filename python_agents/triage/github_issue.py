"""
GitHub issue creation from triage tickets.

Uses the Node.js bridge to create GitHub issues via @octokit/rest.
"""

import json
import re
from pathlib import Path
from typing import Any

import httpx


async def create_github_issue_from_ticket(
    ticket_path: Path,
    repo_owner: str = "Johnsonbros",
    repo_name: str = "ZEKE",
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """
    Create a GitHub issue from a triage ticket.
    
    Args:
        ticket_path: Path to the TICKET-*.md file
        repo_owner: GitHub repository owner
        repo_name: GitHub repository name
        labels: Labels to add to the issue
        
    Returns:
        Dict with issue URL and number on success
    """
    if not ticket_path.exists():
        raise FileNotFoundError(f"Ticket not found: {ticket_path}")
    
    content = ticket_path.read_text()
    
    title_match = re.search(r"# Triage Ticket: (.+)", content)
    run_id = title_match.group(1) if title_match else ticket_path.stem
    
    failure_match = re.search(r"\*\*Failure Type:\*\* `(.+)`", content)
    failure_type = failure_match.group(1) if failure_match else "unknown"
    
    title = f"[Triage] {failure_type}: {run_id}"
    
    body = f"""## Auto-generated Triage Ticket

This issue was automatically created from a failure triage ticket.

---

{content}
"""
    
    labels = labels or ["triage", "auto-generated"]
    
    payload = {
        "owner": repo_owner,
        "repo": repo_name,
        "title": title,
        "body": body,
        "labels": labels,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:5000/api/github/create-issue",
            json=payload,
            timeout=30.0,
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            raise RuntimeError(
                f"Failed to create GitHub issue: {response.status_code} - {response.text}"
            )


async def process_pending_tickets(
    triage_dir: Path | str = "triage",
    repo_owner: str = "Johnsonbros",
    repo_name: str = "ZEKE",
    archive_after_create: bool = True,
) -> list[dict[str, Any]]:
    """
    Process all pending triage tickets and create GitHub issues.
    
    Args:
        triage_dir: Directory containing triage tickets
        repo_owner: GitHub repository owner
        repo_name: GitHub repository name
        archive_after_create: Whether to archive tickets after creating issues
        
    Returns:
        List of created issue details
    """
    from python_agents.triage import get_triage_generator
    
    triage_dir = Path(triage_dir)
    generator = get_triage_generator(triage_dir=triage_dir)
    
    pending = generator.get_pending_tickets()
    created = []
    
    for ticket_path in pending:
        try:
            result = await create_github_issue_from_ticket(
                ticket_path,
                repo_owner=repo_owner,
                repo_name=repo_name,
            )
            
            if archive_after_create:
                generator.archive_ticket(ticket_path)
            
            created.append({
                "ticket": ticket_path.name,
                "issue": result,
            })
        except Exception as e:
            created.append({
                "ticket": ticket_path.name,
                "error": str(e),
            })
    
    return created
