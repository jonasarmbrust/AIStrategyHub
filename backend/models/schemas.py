"""
Pydantic models for the OAIMM (Open AI Maturity Meta-Model) API.
Defines request/response schemas for all endpoints.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────

class MaturityLevel(int, Enum):
    EXPLORING = 1
    EXPERIMENTING = 2
    OPERATIONALIZING = 3
    SCALING = 4
    TRANSFORMING = 5


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceCategory(str, Enum):
    FRAMEWORK = "framework"
    REGULATION = "regulation"
    WHITEPAPER = "whitepaper"
    ARTICLE = "article"
    REPORT = "report"
    TOOL = "tool"


class ExportFormat(str, Enum):
    MARKDOWN = "markdown"
    PDF = "pdf"


class EffortLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# ── Traceability Engine ───────────────────────────────────────────────────────

class EvidenceTag(BaseModel):
    """Links a checkpoint to its original source with specific reference."""
    source: str
    reference: str
    url: Optional[str] = None


# ── Knowledge Base Models ──────────────────────────────────────────────────────

class Checkpoint(BaseModel):
    id: str
    text: str
    text_de: str
    min_level: int
    sources: list[str]
    category: str
    evidence_tags: list[EvidenceTag] = []


class Dimension(BaseModel):
    id: str
    name: str
    name_de: str
    icon: str
    weight: float
    description: str
    sources: list[str]
    checkpoints: list[Checkpoint]


class MaturityModel(BaseModel):
    version: str
    model_name: str
    description: str
    maturity_levels: list[dict]
    dimensions: list[Dimension]


# ── Checklist Models ───────────────────────────────────────────────────────────

class CheckpointAssessment(BaseModel):
    checkpoint_id: str
    fulfilled: bool = False
    level: int = Field(default=0, ge=0, le=5)
    notes: str = ""
    evidence: str = ""


class DimensionScore(BaseModel):
    dimension_id: str
    dimension_name: str
    icon: str
    weight: float
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    level: int = Field(default=1, ge=1, le=5)
    assessments: list[CheckpointAssessment] = []
    fulfilled_count: int = 0
    total_count: int = 0


class MaturityReport(BaseModel):
    overall_score: float = Field(default=0.0, ge=0.0, le=100.0)
    overall_level: int = Field(default=1, ge=1, le=5)
    dimension_scores: list[DimensionScore] = []
    strengths: list[str] = []
    gaps: list[str] = []
    recommendations: list[str] = []
    assessed_at: datetime = Field(default_factory=datetime.now)


# ── Manual Assessment ──────────────────────────────────────────────────────────

class ManualAssessmentRequest(BaseModel):
    """User submits manual assessment answers."""
    assessments: list[CheckpointAssessment]


# ── Document Analysis Models ──────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    uploaded_at: datetime = Field(default_factory=datetime.now)
    chunk_count: int = 0


class CheckpointEvaluation(BaseModel):
    checkpoint_id: str
    checkpoint_text: str
    covered: bool
    level: int = Field(default=0, ge=0, le=5)
    evidence: str = ""
    relevant_chunks: list[str] = []
    recommendation: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class AnalysisResult(BaseModel):
    id: str
    document_id: str
    document_name: str
    status: AnalysisStatus = AnalysisStatus.PENDING
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    report: Optional[MaturityReport] = None
    evaluations: list[CheckpointEvaluation] = []
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


# ── Research Agent Models ──────────────────────────────────────────────────────

class ResearchSource(BaseModel):
    id: str
    title: str
    url: str
    summary: str
    category: SourceCategory
    relevant_dimensions: list[str] = []
    published_date: Optional[str] = None
    discovered_at: datetime = Field(default_factory=datetime.now)
    is_read: bool = False
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0)


class ResearchTriggerRequest(BaseModel):
    query: Optional[str] = None
    dimensions: list[str] = []
    max_results: int = Field(default=10, ge=1, le=50)
    language: str = "both"  # "english", "german", "both"
    pdf_only: bool = False


class ResearchFeedResponse(BaseModel):
    sources: list[ResearchSource]
    total_count: int
    new_count: int
    last_search_at: Optional[datetime] = None


# ── Roadmap Models ─────────────────────────────────────────────────────────────

class RoadmapItem(BaseModel):
    """A single gap-analysis action item with priority and traceability."""
    checkpoint_id: str
    checkpoint_text: str
    checkpoint_text_de: str
    dimension_id: str
    dimension_name: str
    dimension_icon: str
    current_level: int = 0
    target_level: int = 3
    min_level: int = 1
    priority_score: float = Field(default=0.0, ge=0.0, le=100.0)
    effort: EffortLevel = EffortLevel.MEDIUM
    evidence_tags: list[EvidenceTag] = []
    category: str = ""


class RoadmapRequest(BaseModel):
    """Request to generate a prioritized roadmap."""
    target_level: int = Field(default=3, ge=1, le=5)
    assessments: dict[str, dict] = {}
    focus_dimensions: list[str] = []


class RoadmapResponse(BaseModel):
    """Prioritized roadmap with gap analysis."""
    target_level: int
    current_level: int = 1
    current_score: float = 0.0
    total_gaps: int = 0
    quick_wins: list[RoadmapItem] = []
    items: list[RoadmapItem] = []
    dimension_gaps: dict[str, int] = {}


# ── Dashboard Models ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_analyses: int = 0
    latest_score: Optional[float] = None
    latest_level: Optional[int] = None
    total_sources: int = 0
    new_sources: int = 0
    dimension_averages: dict[str, float] = {}


class AnalysisHistoryItem(BaseModel):
    id: str
    document_name: str
    overall_score: float
    overall_level: int
    assessed_at: datetime


# ── API Responses ──────────────────────────────────────────────────────────────

class ChecklistResponse(BaseModel):
    dimensions: list[Dimension]
    total_checkpoints: int
    model_version: str


class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None
