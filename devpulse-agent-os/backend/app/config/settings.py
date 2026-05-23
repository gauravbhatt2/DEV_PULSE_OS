"""
DevPulse Agent OS — Unified Application Configuration
Merges settings from both devpulse and DevPlus-OS backends.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    project_name: str = "DevPulse Agent OS"
    debug: bool = False

    # Database (PostgreSQL)
    database_url: str = "postgresql://devpulse:devpulse_secret@localhost:5434/devpulse_db"

    # Ollama (Local SLM — optional for hackathon demo)
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"

    # Jira Integration
    jira_email: str = ""
    jira_token: str = ""
    jira_domain: str = ""

    # GitHub App Authentication
    github_app_id: str = ""
    github_private_key_path: str = "keys/devpulse-agent-os.private-key.pem"
    github_installation_id: str = ""
    github_webhook_secret: str = ""

    # Optional: Groq for AI priority analysis
    groq_api_key: str = ""
    groq_model: str = "llama3-8b-8192"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
