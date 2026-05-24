"""
DevPulse Agent OS — Unified Database Schema
Tables:
  github_events       — Raw GitHub webhook payloads
  jira_events         — Raw Jira webhook payloads
  linked_activity     — GitHub ↔ Jira correlation bridge
  activities          — Issue action tracking (start/done)
  slack_threads       — Slack message ingestion
  cicd_pipelines      — CI/CD pipeline run tracking
  agent_audit_logs    — Multi-agent orchestration audit trail
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.config.database import Base


class GitHubEvent(Base):
    """
    Raw inbound GitHub webhook payloads.
    extracted_ticket_id: Jira key parsed from commit message / PR title / branch name.
    """
    __tablename__ = "github_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSONB, nullable=False)
    extracted_ticket_id = Column(String(50), index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    linked_activities = relationship("LinkedActivity", back_populates="github_event")

    def __repr__(self):
        return f"<GitHubEvent id={self.id} type={self.event_type!r} ticket={self.extracted_ticket_id}>"


class JiraEvent(Base):
    """Raw inbound Jira webhook payloads."""
    __tablename__ = "jira_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False)
    ticket_id = Column(String(50), index=True, nullable=False)
    payload = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<JiraEvent id={self.id} ticket={self.ticket_id!r}>"


class LinkedActivity(Base):
    """
    Correlation bridge tying a GitHub event to a Jira ticket.
    Populated automatically by the correlation engine when a Jira key
    is extracted from a GitHub event payload.
    match_type: 'regex' (ticket key found in commit) | 'ai' (Groq semantic match)
    """
    __tablename__ = "linked_activity"

    id = Column(Integer, primary_key=True, index=True)
    github_event_id = Column(
        Integer,
        ForeignKey("github_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    jira_ticket_id = Column(String(50), index=True, nullable=False)
    description = Column(Text, nullable=True)
    match_type = Column(String(20), nullable=False, server_default="regex")  # 'regex' | 'ai'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    github_event = relationship("GitHubEvent", back_populates="linked_activities")

    def __repr__(self):
        return (
            f"<LinkedActivity id={self.id} "
            f"github_event_id={self.github_event_id} "
            f"jira_ticket_id={self.jira_ticket_id!r}>"
        )


class Activity(Base):
    """
    Tracks user-initiated actions on Jira issues (start / done).
    Used by the frontend activity timeline.
    """
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    issue_key = Column(String(50), index=True, nullable=False)
    status = Column(String(100), nullable=False)
    action_type = Column(String(50), nullable=False)  # start | done
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Activity id={self.id} key={self.issue_key!r} action={self.action_type!r}>"


class SlackThread(Base):
    """Stores Slack messages ingested via the Slack Event API webhook."""
    __tablename__ = "slack_threads"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(100), nullable=False, index=True)
    thread_ts = Column(String(50), nullable=False, index=True)
    user_id = Column(String(100), nullable=False)
    message_content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<SlackThread id={self.id} channel={self.channel_id!r}>"


class CICDPipeline(Base):
    """Records CI/CD pipeline executions."""
    __tablename__ = "cicd_pipelines"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(String(200), nullable=False, index=True)
    pipeline_run_id = Column(String(200), nullable=False, unique=True)
    status = Column(String(50), nullable=False, index=True)
    duration_seconds = Column(Integer, nullable=True)
    commit_sha = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<CICDPipeline id={self.id} run={self.pipeline_run_id!r} status={self.status!r}>"


class AgentAuditLog(Base):
    """Immutable audit trail for every action taken by a DevPulse agent."""
    __tablename__ = "agent_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    agent_name = Column(String(150), nullable=False, index=True)
    action_taken = Column(Text, nullable=False)
    extracted_metadata = Column(JSONB, nullable=True, default={})
    execution_time_ms = Column(Integer, nullable=True)
    status = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<AgentAuditLog id={self.id} agent={self.agent_name!r} status={self.status!r}>"
