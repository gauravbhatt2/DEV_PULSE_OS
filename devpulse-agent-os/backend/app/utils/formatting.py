from datetime import datetime


def format_hour(h: int) -> str:
    period = "PM" if h >= 12 else "AM"
    hour = h % 12
    if hour == 0:
        hour = 12
    return f"{hour} {period}"


def get_last_sync_time() -> str:
    return datetime.now().strftime("%I:%M %p")
