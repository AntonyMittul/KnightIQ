import requests
import logging

logger = logging.getLogger(__name__)

def get_player_archives(username: str):
    """Fetch the list of monthly archive URLs for a player."""
    headers = {
        "User-Agent": "AI-Chess-Performance-Analyzer (contact: user@example.com)"
    }
    url = f"https://api.chess.com/pub/player/{username}/games/archives"
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json().get("archives", [])
    logger.error(f"Failed to fetch archives for {username}: {response.text}")
    return []

def get_games_from_archive(archive_url: str):
    """Fetch games from a specific monthly archive URL."""
    headers = {
        "User-Agent": "AI-Chess-Performance-Analyzer (contact: user@example.com)"
    }
    response = requests.get(archive_url, headers=headers)
    if response.status_code == 200:
        return response.json().get("games", [])
    logger.error(f"Failed to fetch games from {archive_url}: {response.text}")
    return []
