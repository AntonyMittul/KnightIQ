from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import pattern_detector
import os
from google import genai
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional
import json

load_dotenv()

router = APIRouter(prefix="/api/coach", tags=["coach"])

class ChatRequest(BaseModel):
    message: str

@router.post("/{email}/chat")
def chat_with_coach(email: str, req: ChatRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured on server.")
        
    # Get user patterns
    games = db.query(models.Game).filter(models.Game.user_id == user.id, models.Game.accuracy != None).all()
    if not games:
        stats = "User has no analyzed games yet."
    else:
        stats = pattern_detector.analyze_patterns(games, user.chess_com_username)
        
    # Build System Prompt
    system_prompt = f"""You are a personalized, data-driven AI Chess Coach.
You are talking to {user.name} (Chess.com username: {user.chess_com_username}).
Here is their EXACT performance data based on Stockfish 16.1 analysis of their games:
{stats}

CRITICAL RULES FOR YOUR RESPONSE:
1. Be extremely concise, direct, and on-point. Do NOT use conversational fluff, long introductions, or bragging.
2. Structure your response using clear Markdown formatting (bullet points, bold text). Make it highly scannable.
3. If giving advice, limit it to 2-3 highly actionable, punchy bullet points.
4. Only reference specific statistics if they are directly relevant to the user's question.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[system_prompt, req.message],
        )
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{email}/training-plan")
def get_training_plan(email: str, time_class: Optional[str] = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured on server.")
        
    query = db.query(models.Game).filter(models.Game.user_id == user.id, models.Game.accuracy != None)
    if time_class and time_class.lower() != "all":
        query = query.filter(models.Game.time_class == time_class.lower())
    
    total_games = query.count()
    if total_games == 0:
        return {"message": "No analyzed games found."}
        
    from routers.users import get_cache_path
    cache_file = get_cache_path(user.id, time_class)
    
    stats = None
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r") as f:
                cached_stats = json.load(f)
            if cached_stats.get("total_analyzed_games") == total_games:
                stats = cached_stats
        except: pass
        
    if not stats:
        games = query.all()
        stats = pattern_detector.analyze_patterns(games, user.chess_com_username)
        
    import datetime
    today_str = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    plan_cache_file = os.path.join("cache", f"training_plan_{user.id}_{time_class or 'all'}_{total_games}_{today_str}.json")
    if os.path.exists(plan_cache_file):
        try:
            with open(plan_cache_file, "r") as f:
                return json.load(f)
        except: pass
        
    system_prompt = f"""You are an elite chess coach. The user wants a structured training plan based on their stats.
Stats: {stats}

Return a STRICT JSON object in the following format. DO NOT INCLUDE MARKDOWN CODE BLOCKS AROUND THE JSON. ONLY RETURN THE RAW JSON.
{{
    "focus_areas": [
        "Weakness 1 (e.g. Stop missing forks)",
        "Weakness 2",
        "Weakness 3"
    ],
    "tactics_to_solve": [
        {{"theme": "Forks", "url": "https://lichess.org/training/fork"}},
        {{"theme": "Defensive moves", "url": "https://lichess.org/training/defensiveMove"}}
    ],
    "opening_suggestions": [
        {{"name": "Opening 1", "reason": "Why they should study this based on their bad winrate"}}
    ]
}}
Make the advice highly specific to their actual stats.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[system_prompt],
        )
        
        response_text = response.text.strip()
        if response_text.startswith("```json"): response_text = response_text[7:]
        if response_text.startswith("```"): response_text = response_text[3:]
        if response_text.endswith("```"): response_text = response_text[:-3]
            
        plan = json.loads(response_text)
        
        with open(plan_cache_file, "w") as f:
            json.dump(plan, f)
            
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import datetime

@router.post("/{email}/training/complete")
def complete_training(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    
    today = datetime.datetime.utcnow().date()
    logs = db.query(models.TrainingLog).filter(models.TrainingLog.user_id == user.id).all()
    today_log = next((l for l in logs if l.date.date() == today), None)
    
    if not today_log:
        new_log = models.TrainingLog(user_id=user.id, completed=True, date=datetime.datetime.utcnow())
        db.add(new_log)
        db.commit()
        return {"message": "Training marked as complete", "streak_updated": True}
    return {"message": "Already completed today", "streak_updated": False}

@router.get("/{email}/training/history")
def get_training_history(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user: return []
    logs = db.query(models.TrainingLog).filter(models.TrainingLog.user_id == user.id).order_by(models.TrainingLog.date.desc()).all()
    return [{"date": log.date.isoformat(), "completed": log.completed} for log in logs]
