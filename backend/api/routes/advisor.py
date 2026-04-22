"""
AI Strategy Advisor — Context-aware chatbot endpoint.
Uses the user's assessment data, framework model, and research sources
to provide personalized strategic guidance via Gemini 3.1 Pro.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import google.generativeai as genai
from fastapi import APIRouter
from pydantic import BaseModel

from database import get_db
from knowledge_base.checklist_generator import get_maturity_model, calculate_maturity_score

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


def _build_system_context() -> str:
    """Build a rich system prompt with the user's current framework state."""

    # 1. Framework model summary
    model = get_maturity_model()
    dim_summaries = []
    total_checkpoints = 0
    for dim in model.dimensions:
        total_checkpoints += len(dim.checkpoints)
        sample_cps = [cp.text for cp in dim.checkpoints[:3]]
        dim_summaries.append(
            f"- {dim.icon} **{dim.name}** (ID: {dim.id}, weight: {dim.weight:.0%}, "
            f"{len(dim.checkpoints)} checkpoints). Examples: {'; '.join(sample_cps)}"
        )
    framework_text = "\n".join(dim_summaries)

    return f"""You are the **AI Strategy Hub Advisor** — a senior AI strategy consultant with deep expertise in enterprise AI maturity assessment.

## Your Knowledge Base
You have access to the **AI Strategy Hub Maturity Model**, which synthesizes best practices from:
- NIST AI Risk Management Framework (AI RMF)
- EU AI Act (enforcement starting August 2026)
- Google Responsible AI Practices
- Microsoft Responsible AI Standard
- OWASP Machine Learning Security Top 10
- UNESCO AI Ethics Recommendation

## Framework Structure
The model has {len(model.dimensions)} dimensions and {total_checkpoints} checkpoints:
{framework_text}

## Maturity Levels
1. **Initial** (0-24%): Ad-hoc, no formal AI strategy
2. **Developing** (25-49%): Awareness, initial experiments
3. **Defined** (50-69%): Formal strategy, structured processes
4. **Managed** (70-89%): Measured, optimized, cross-functional
5. **Optimizing** (90-100%): Industry-leading, continuous innovation

## Your Behavior Rules
1. Always ground your advice in specific dimensions and checkpoints
2. Reference the original source frameworks (NIST, EU AI Act, etc.) when relevant
3. Be specific and actionable — suggest concrete next steps, not generic advice
4. If asked about EU AI Act compliance, mention relevant fines and deadlines
5. When suggesting improvements, estimate the score impact when possible
6. Speak professionally but accessibly — like a top-tier strategy consultant
7. If the user provides assessment context, personalize your advice accordingly
8. You can reference checkpoint IDs (e.g. CP_ST_01) for traceability
9. Keep responses focused and structured — use bullet points and headers
10. Answer in the same language the user uses (German or English)"""


async def _get_user_context() -> str:
    """Fetch the user's current assessment state and research sources."""
    context_parts = []

    # Latest manual assessment
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT assessments, overall_score, overall_level, dimension_scores, strengths, gaps "
            "FROM manual_assessments ORDER BY created_at DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        if row:
            score = row["overall_score"]
            level = row["overall_level"]
            dim_scores = json.loads(row["dimension_scores"])
            strengths = json.loads(row["strengths"])
            gaps = json.loads(row["gaps"])

            dim_text = ", ".join([f'{d["dimension_id"]}: {d["score"]:.0f}%' for d in dim_scores])
            context_parts.append(
                f"## Current Assessment State\n"
                f"- Overall Score: {score:.0f}/100 (Level {level})\n"
                f"- Dimension Scores: {dim_text}\n"
                f"- Strengths: {', '.join(strengths[:5]) if strengths else 'None identified'}\n"
                f"- Gaps: {', '.join(gaps[:5]) if gaps else 'None identified'}"
            )

        # Latest document analysis
        cursor = await db.execute(
            "SELECT document_name, overall_score, overall_level, strengths, gaps "
            "FROM analyses WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1"
        )
        analysis = await cursor.fetchone()
        if analysis:
            context_parts.append(
                f"\n## Latest Document Analysis\n"
                f"- Document: {analysis['document_name']}\n"
                f"- Score: {analysis['overall_score']:.0f}/100 (Level {analysis['overall_level']})"
            )

        # Research sources
        cursor = await db.execute(
            "SELECT title, relevance_score, relevant_dimensions FROM research_sources "
            "ORDER BY relevance_score DESC LIMIT 5"
        )
        sources = await cursor.fetchall()
        if sources:
            src_text = "\n".join([
                f"- {s['title']} (Relevance: {s['relevance_score']:.0%})"
                for s in sources
            ])
            context_parts.append(f"\n## Top Research Sources\n{src_text}")

    finally:
        await db.close()

    return "\n".join(context_parts) if context_parts else "No assessment data available yet."


@router.post("/chat")
async def advisor_chat(request: ChatRequest):
    """Chat with the AI Strategy Advisor."""

    system_prompt = _build_system_context()
    user_context = await _get_user_context()

    # Build conversation for Gemini
    gemini_model = genai.GenerativeModel(
        "gemini-3.1-pro-preview",
        system_instruction=system_prompt,
    )

    # Build chat history
    gemini_history = []
    
    # Inject user context as first message
    gemini_history.append({
        "role": "user",
        "parts": [f"[SYSTEM CONTEXT — My current assessment data]\n{user_context}"]
    })
    gemini_history.append({
        "role": "model",
        "parts": ["I've reviewed your current assessment data. I'm ready to advise you on your AI maturity strategy. How can I help?"]
    })

    # Add conversation history
    for msg in request.history:
        gemini_history.append({
            "role": "user" if msg.role == "user" else "model",
            "parts": [msg.content]
        })

    chat = gemini_model.start_chat(history=gemini_history)
    response = chat.send_message(request.message)

    return {
        "response": response.text,
        "context_loaded": bool(user_context.strip()),
    }


@router.get("/context")
async def get_advisor_context():
    """Return the current context the advisor sees (for transparency)."""
    user_context = await _get_user_context()
    model = get_maturity_model()
    return {
        "dimensions": len(model.dimensions),
        "checkpoints": sum(len(d.checkpoints) for d in model.dimensions),
        "context_preview": user_context[:500],
        "has_assessment": "Overall Score" in user_context,
        "has_research": "Research Sources" in user_context,
    }
