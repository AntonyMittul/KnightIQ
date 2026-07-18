import chess
import chess.engine
import os
import json
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

def get_engine_path():
    if sys.platform != 'win32':
        return "stockfish" # Globally available via apt-get in Docker
    
    base_dir = os.path.dirname(__file__)
    # For Windows:
    return os.path.join(base_dir, "bin", "stockfish", "stockfish.exe")

def evaluate_game(moves_list_json, username, white_player):
    """
    Evaluates a sequence of moves using Stockfish.
    Returns: blunders, mistakes, inaccuracies, accuracy, evaluations_json
    """
    engine_path = get_engine_path()
    if not os.path.exists(engine_path):
        raise FileNotFoundError(f"Stockfish engine not found at {engine_path}")
        
    try:
        moves = json.loads(moves_list_json)
    except:
        return 0, 0, 0, 0.0, "[]"
        
    blunders = 0
    mistakes = 0
    inaccuracies = 0
    user_cpl_sum = 0
    evaluations = []
    
    board = chess.Board()
    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    # Give the engine a little bit of power for local processing
    engine.configure({"Threads": 2, "Hash": 128})
    
    is_user_white = (white_player == username)
    
    # Evaluate starting position
    info = engine.analyse(board, chess.engine.Limit(time=0.1))
    score = info["score"].white()
    prev_eval = 10000 if score.is_mate() and score.mate() > 0 else (-10000 if score.is_mate() else score.score())
    
    best_move_obj = info.get("pv", [None])[0]
    best_move_san = board.san(best_move_obj) if best_move_obj else None
    
    for i, move_san in enumerate(moves):
        is_white_turn = board.turn
        
        try:
            move = board.parse_san(move_san)
        except ValueError:
            break
            
        board.push(move)
        
        # Analyse with a 0.1s time limit per move to keep it fast
        info = engine.analyse(board, chess.engine.Limit(time=0.1)) 
        score = info["score"].white()
        
        if score.is_mate():
            cp_score = 10000 if score.mate() > 0 else -10000
        else:
            cp_score = score.score()
            
        user_just_played = (is_user_white and is_white_turn) or (not is_user_white and not is_white_turn)
        
        move_cpl = 0
        if user_just_played:
            if is_user_white:
                move_cpl = cp_score - prev_eval
            else:
                move_cpl = prev_eval - cp_score
                
            # Cap CPL to avoid massive mate blunders throwing off the entire average instantly
            move_cpl = max(-1000, min(0, move_cpl))
            user_cpl_sum += abs(move_cpl)
                
            # CPL is usually negative if you made a bad move
            if move_cpl <= -300:
                blunders += 1
            elif move_cpl <= -100:
                mistakes += 1
            elif move_cpl <= -50:
                inaccuracies += 1
                
        # Store detailed evaluation per the Phase 4 requirements
        evaluations.append({
            "played_move": move_san,
            "best_move": best_move_san,
            "eval": cp_score / 100.0,
            "cpl": move_cpl if user_just_played else None
        })
        
        # Set up variables for the next turn
        prev_eval = cp_score
        best_move_obj = info.get("pv", [None])[0]
        best_move_san = board.san(best_move_obj) if best_move_obj else None
        
    engine.quit()
    
    # Calculate mathematically sound accuracy based on Average Centipawn Loss (ACPL)
    import math
    user_moves_count = (len(moves) + 1) // 2 if is_user_white else len(moves) // 2
    
    if user_moves_count == 0:
        accuracy = 100.0
    else:
        avg_cpl = user_cpl_sum / max(1, user_moves_count)
        # Exponential decay mapping CPL to Accuracy
        # 0 CPL = 100%, 50 CPL = 77%, 100 CPL = 60%, 200 CPL = 36%
        accuracy = 100 * math.exp(-0.005 * avg_cpl)
        accuracy = max(0.0, min(100.0, accuracy))
        
    return blunders, mistakes, inaccuracies, round(accuracy, 1), json.dumps(evaluations)
