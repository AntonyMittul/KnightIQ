from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
import models, schemas, chess_client
from datetime import datetime
import io
import json
import chess.pgn
import analyzer
import pattern_detector

router = APIRouter(prefix="/api/users", tags=["users"])

def fetch_and_save_games(user_id: str, chess_username: str):
    from database import SessionLocal
    db = SessionLocal()
    try:
        archives = chess_client.get_player_archives(chess_username)
        if not archives:
            return
        
        # Process all historical archives for a complete game history
        for archive_url in archives:
            games_data = chess_client.get_games_from_archive(archive_url)
            for game_data in games_data:
                existing = db.query(models.Game).filter(models.Game.url == game_data.get("url")).first()
            if not existing:
                white = game_data.get("white", {}).get("username")
                black = game_data.get("black", {}).get("username")
                
                raw_pgn = game_data.get("pgn", "")
                opening_name = None
                opening_eco = None
                moves_list = []
                
                if raw_pgn:
                    try:
                        pgn_io = io.StringIO(raw_pgn)
                        parsed_game = chess.pgn.read_game(pgn_io)
                        if parsed_game:
                            opening_eco = parsed_game.headers.get("ECO")
                            # Chess.com often puts the name in ECOUrl like .../openings/Caro-Kann-Defense
                            eco_url = parsed_game.headers.get("ECOUrl", "")
                            opening_name = eco_url.split("/")[-1].replace("-", " ") if eco_url else parsed_game.headers.get("Opening")
                            
                            board = parsed_game.board()
                            for move in parsed_game.mainline_moves():
                                moves_list.append(board.san(move))
                                board.push(move)
                    except Exception as e:
                        print(f"Failed to parse PGN: {e}")
                
                new_game = models.Game(
                    user_id=user_id,
                    url=game_data.get("url"),
                    pgn=raw_pgn,
                    white=white,
                    black=black,
                    white_rating=game_data.get("white", {}).get("rating"),
                    black_rating=game_data.get("black", {}).get("rating"),
                    time_control=game_data.get("time_control"),
                    time_class=game_data.get("time_class"),
                    end_time=datetime.fromtimestamp(game_data.get("end_time")) if game_data.get("end_time") else None,
                    opening_name=opening_name,
                    opening_eco=opening_eco,
                    moves_list=json.dumps(moves_list) if moves_list else None
                )
                db.add(new_game)
        db.commit()
    finally:
        db.close()

@router.post("/login", response_model=schemas.UserResponse)
def login_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user:
        db_user = models.User(email=user.email, name=user.name)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    return db_user

@router.post("/{email}/sync-chess", response_model=schemas.SyncResponse)
def sync_chess_account(email: str, chess_username: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.chess_com_username != chess_username:
        # If the user changes their tracked username, clear the old games
        db.query(models.Game).filter(models.Game.user_id == user.id).delete()
        user.chess_com_username = chess_username
        
    db.commit()
    
    # Run fetch in background
    background_tasks.add_task(fetch_and_save_games, user.id, chess_username)
    return schemas.SyncResponse(message=f"Syncing started for {chess_username}", games_added=0)

@router.get("/{email}/games")
def get_user_games(email: str, time_class: Optional[str] = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return []
    query = db.query(models.Game).filter(models.Game.user_id == user.id)
    if time_class and time_class.lower() != "all":
        query = query.filter(models.Game.time_class == time_class.lower())
    games = query.order_by(models.Game.end_time.desc()).limit(100).all()
    return games

@router.post("/{email}/analyze-games")
def analyze_games(email: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not user.chess_com_username:
        raise HTTPException(status_code=400, detail="No Chess.com username linked.")
        
    def analyze_user_games(user_id: str, username: str):
        from database import SessionLocal
        db_sess = SessionLocal()
        try:
            games = db_sess.query(models.Game).filter(models.Game.user_id == user_id, models.Game.accuracy == None).order_by(models.Game.end_time.desc()).all()
            for game in games:
                if game.moves_list:
                    blunders, mistakes, inaccuracies, accuracy, evals_json = analyzer.evaluate_game(
                        game.moves_list, username, game.white
                    )
                    game.blunders = blunders
                    game.mistakes = mistakes
                    game.inaccuracies = inaccuracies
                    game.accuracy = accuracy
                    game.evaluations_list = evals_json
                    db_sess.commit()
                    print(f"Analyzed game: {game.white} vs {game.black} | Accuracy: {accuracy}%")
        finally:
            db_sess.close()
                
    background_tasks.add_task(analyze_user_games, user.id, user.chess_com_username)
    return {"message": "Analysis started in background!"}

@router.post("/{email}/refresh-live")
def refresh_live_games(email: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.chess_com_username:
        raise HTTPException(status_code=400, detail="User not found or no chess username linked.")
        
    archives = chess_client.get_player_archives(user.chess_com_username)
    if not archives:
        return {"message": "No archives found", "new_games": 0}
        
    # Only fetch the last 2 months for a quick live refresh
    recent_archives = archives[-2:] if len(archives) >= 2 else archives
    
    new_games_added = 0
    for archive_url in recent_archives:
        games_data = chess_client.get_games_from_archive(archive_url)
        for game_data in games_data:
            existing = db.query(models.Game).filter(models.Game.url == game_data.get("url")).first()
            if not existing:
                white = game_data.get("white", {}).get("username")
                black = game_data.get("black", {}).get("username")
                
                raw_pgn = game_data.get("pgn", "")
                opening_name = None
                opening_eco = None
                moves_list = []
                
                if raw_pgn:
                    try:
                        import io
                        import chess.pgn
                        import json
                        pgn_io = io.StringIO(raw_pgn)
                        parsed_game = chess.pgn.read_game(pgn_io)
                        if parsed_game:
                            opening_eco = parsed_game.headers.get("ECO")
                            eco_url = parsed_game.headers.get("ECOUrl", "")
                            opening_name = eco_url.split("/")[-1].replace("-", " ") if eco_url else parsed_game.headers.get("Opening")
                            board = parsed_game.board()
                            for move in parsed_game.mainline_moves():
                                moves_list.append(board.san(move))
                                board.push(move)
                    except Exception as e:
                        pass
                
                new_game = models.Game(
                    user_id=user.id,
                    url=game_data.get("url"),
                    pgn=raw_pgn,
                    white=white,
                    black=black,
                    white_rating=game_data.get("white", {}).get("rating"),
                    black_rating=game_data.get("black", {}).get("rating"),
                    time_control=game_data.get("time_control"),
                    time_class=game_data.get("time_class"),
                    end_time=datetime.fromtimestamp(game_data.get("end_time")) if game_data.get("end_time") else None,
                    opening_name=opening_name,
                    opening_eco=opening_eco,
                    moves_list=json.dumps(moves_list) if moves_list else None
                )
                db.add(new_game)
                new_games_added += 1
    db.commit()

    if new_games_added > 0:
        def analyze_user_games(user_id: str, username: str):
            from database import SessionLocal
            db_sess = SessionLocal()
            try:
                games = db_sess.query(models.Game).filter(models.Game.user_id == user_id, models.Game.accuracy == None).order_by(models.Game.end_time.desc()).all()
                for game in games:
                    if game.moves_list:
                        blunders, mistakes, inaccuracies, accuracy, evals_json = analyzer.evaluate_game(
                            game.moves_list, username, game.white
                        )
                        game.blunders = blunders
                        game.mistakes = mistakes
                        game.inaccuracies = inaccuracies
                        game.accuracy = accuracy
                        game.evaluations_list = evals_json
                        db_sess.commit()
            finally:
                db_sess.close()
                
        background_tasks.add_task(analyze_user_games, user.id, user.chess_com_username)
        
    return {"message": f"Synced {new_games_added} new games", "new_games": new_games_added}

import os
import json

CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_path(user_id, time_class):
    return os.path.join(CACHE_DIR, f"patterns_{user_id}_{time_class or 'all'}.json")

@router.get("/{email}/patterns")
def get_user_patterns(email: str, time_class: Optional[str] = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not user.chess_com_username:
        raise HTTPException(status_code=400, detail="No Chess.com username linked.")
        
    # Only analyze games that have evaluations stored (i.e. accuracy != None)
    query = db.query(models.Game).filter(models.Game.user_id == user.id, models.Game.accuracy != None)
    if time_class and time_class.lower() != "all":
        query = query.filter(models.Game.time_class == time_class.lower())
        
    total_games_in_db = query.count()
    if total_games_in_db == 0:
        return {"message": "No analyzed games found to detect patterns."}
        
    # Check Cache
    cache_file = get_cache_path(user.id, time_class)
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r") as f:
                cached_stats = json.load(f)
            if cached_stats.get("total_analyzed_games") == total_games_in_db:
                return cached_stats
        except Exception:
            pass

    # Cache miss or stale: fetch games and compute
    games = query.all()
    stats = pattern_detector.analyze_patterns(games, user.chess_com_username)
    
    # Save to Cache
    try:
        with open(cache_file, "w") as f:
            json.dump(stats, f)
    except Exception:
        pass
        
    return stats
