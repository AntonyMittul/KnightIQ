import json
import chess

def analyze_patterns(games, username):
    """
    Analyzes a list of games (which have evaluations_list populated)
    to find tactical weaknesses and frequency statistics.
    """
    stats = {
        "total_analyzed_games": 0,
        "total_blunders": 0,
        "total_mistakes": 0,
        "total_inaccuracies": 0,
        "blunders_by_phase": {
            "opening": 0,   # moves 1-10
            "middlegame": 0, # moves 11-30
            "endgame": 0    # moves 31+
        },
        "tactical_themes": {
            "missed_mates": 0,
            "blundered_mates": 0,
            "hanging_pieces": 0,
            "missed_forks": 0,
            "missed_pins": 0,
            "missed_skewers": 0,
            "early_queen_attacks": 0,
            "delayed_castling": 0,
            "weak_king_safety": 0,
            "time_pressure_blunders": 0
        },
        "win_loss": {"wins": 0, "losses": 0, "draws": 0},
        "opening_performance": {},
        "heatmap": {},
        "monthly_reports": {},
        "weekly_reports": {},
        "rating_trend": [],
        "accuracy_trend": []
    }
    
    for game in games:
        if not game.evaluations_list or game.evaluations_list == "[]":
            continue
            
        try:
            evals = json.loads(game.evaluations_list)
        except:
            continue
            
        stats["total_analyzed_games"] += 1
        stats["total_blunders"] += game.blunders
        stats["total_mistakes"] += game.mistakes
        stats["total_inaccuracies"] += game.inaccuracies
        
        is_user_white = (game.white == username)
        
        # Win/Loss logic
        if game.result == "1/2-1/2":
            stats["win_loss"]["draws"] += 1
            wl_key = "draws"
        else:
            white_won = (game.result == "1-0")
            if (white_won and is_user_white) or (not white_won and not is_user_white):
                stats["win_loss"]["wins"] += 1
                wl_key = "wins"
            else:
                stats["win_loss"]["losses"] += 1
                wl_key = "losses"
                
        # Monthly Reports
        if game.end_time:
            month_key = game.end_time.strftime("%Y-%m")
            if month_key not in stats["monthly_reports"]:
                stats["monthly_reports"][month_key] = {
                    "games": 0, "blunders": 0, "wins": 0, "losses": 0, "draws": 0, "accuracy_sum": 0, "accuracy_count": 0
                }
            m_stat = stats["monthly_reports"][month_key]
            m_stat["games"] += 1
            m_stat["blunders"] += game.blunders
            m_stat[wl_key] += 1
            if game.accuracy is not None:
                m_stat["accuracy_sum"] += game.accuracy
                m_stat["accuracy_count"] += 1

            # Weekly Reports
            year, week, _ = game.end_time.isocalendar()
            week_key = f"{year}-W{week:02d}"
            if week_key not in stats["weekly_reports"]:
                stats["weekly_reports"][week_key] = {
                    "games": 0, "blunders": 0, "wins": 0, "losses": 0, "draws": 0, "accuracy_sum": 0, "accuracy_count": 0
                }
            w_stat = stats["weekly_reports"][week_key]
            w_stat["games"] += 1
            w_stat["blunders"] += game.blunders
            w_stat[wl_key] += 1
            if game.accuracy is not None:
                w_stat["accuracy_sum"] += game.accuracy
                w_stat["accuracy_count"] += 1
                
        # Opening performance
        if game.opening_name:
            if game.opening_name not in stats["opening_performance"]:
                stats["opening_performance"][game.opening_name] = {"wins": 0, "losses": 0, "draws": 0}
            stats["opening_performance"][game.opening_name][wl_key] += 1
            
        # Trends
        if game.end_time:
            user_rating = game.white_rating if is_user_white else game.black_rating
            if user_rating:
                stats["rating_trend"].append({"date": game.end_time.isoformat(), "rating": user_rating})
            if game.accuracy is not None:
                stats["accuracy_trend"].append({"date": game.end_time.isoformat(), "accuracy": game.accuracy})
        
        board = chess.Board()
        
        user_queen_moves_in_opening = 0
        has_castled = False
        king_safety_flagged = False
        
        for ply, move_data in enumerate(evals):
            played_move_san = move_data.get("played_move")
            cpl = move_data.get("cpl")
            best_move_san = move_data.get("best_move")
            eval_score = move_data.get("eval")
            
            if not played_move_san:
                continue
                
            is_white_turn = board.turn
            user_turn = (is_user_white and is_white_turn) or (not is_user_white and not is_white_turn)
            move_number = (ply // 2) + 1
            
            try:
                move = board.parse_san(played_move_san)
                best_move = board.parse_san(best_move_san) if best_move_san else None
            except ValueError:
                break
                
            # 1. Early Queen Attacks (Queen moves multiple times in first 10 moves)
            if user_turn and move_number <= 10:
                p = board.piece_at(move.from_square)
                if p and p.piece_type == chess.QUEEN:
                    user_queen_moves_in_opening += 1
                    if user_queen_moves_in_opening == 2:
                        stats["tactical_themes"]["early_queen_attacks"] += 1
                        
            # 2. Delayed Castling (Check if king is still uncastled by move 15)
            if user_turn and move_number == 15 and not has_castled:
                king_sq = board.king(is_white_turn)
                if king_sq in [chess.E1, chess.E8]:
                    stats["tactical_themes"]["delayed_castling"] += 1
                    
            if user_turn and board.is_castling(move):
                has_castled = True
                
            # Detect Missed Tactics (Forks, Pins, Skewers) when user makes a mistake
            if user_turn and cpl is not None and cpl <= -100 and best_move:
                board.push(best_move)
                
                moved_piece = board.piece_at(best_move.to_square)
                
                # Check Missed Fork: moved piece attacks 2+ enemy pieces (excluding pawns for simple fork detection)
                if moved_piece:
                    attacks = board.attacks(best_move.to_square)
                    valuable_targets = [sq for sq in attacks if board.color_at(sq) != is_white_turn and board.piece_type_at(sq) != chess.PAWN]
                    if len(valuable_targets) >= 2:
                        stats["tactical_themes"]["missed_forks"] += 1
                        
                # Check Missed Pin: does best_move result in an enemy piece being pinned to their king?
                pinned_enemy = False
                for sq in chess.SQUARES:
                    if board.color_at(sq) != is_white_turn and board.piece_type_at(sq) != chess.KING:
                        if board.is_pinned(not is_white_turn, sq):
                            pinned_enemy = True
                            break
                if pinned_enemy:
                    stats["tactical_themes"]["missed_pins"] += 1
                    
                # Check Missed Skewer: basic heuristic - best move is a check, forcing King to move and expose a piece behind it
                if board.is_check():
                    stats["tactical_themes"]["missed_skewers"] += 1
                
                board.pop()
                
            # Push actual played move
            board.push(move)
            
            # 3. Weak King Safety
            if user_turn and has_castled and not king_safety_flagged and move_number > 15:
                king_sq = board.king(is_user_white)
                if king_sq:
                    # Count friendly pawns surrounding the king
                    kf, kr = chess.square_file(king_sq), chess.square_rank(king_sq)
                    pawns_nearby = 0
                    for df in [-1, 0, 1]:
                        for dr in [-1, 0, 1]:
                            f, r = kf + df, kr + dr
                            if 0 <= f <= 7 and 0 <= r <= 7:
                                sq = chess.square(f, r)
                                p = board.piece_at(sq)
                                if p and p.piece_type == chess.PAWN and p.color == is_user_white:
                                    pawns_nearby += 1
                    if pawns_nearby < 2:
                        stats["tactical_themes"]["weak_king_safety"] += 1
                        king_safety_flagged = True
                        
            # Blunder specific detection
            if cpl is not None and cpl <= -300 and user_turn:
                # Phase categorization
                if move_number <= 10:
                    stats["blunders_by_phase"]["opening"] += 1
                elif move_number <= 30:
                    stats["blunders_by_phase"]["middlegame"] += 1
                else:
                    stats["blunders_by_phase"]["endgame"] += 1
                    
                # Time Pressure Blunders (Endgame + Move 40+)
                if move_number >= 40:
                    stats["tactical_themes"]["time_pressure_blunders"] += 1
                    
                # Blunder Heatmap
                square_name = chess.square_name(move.to_square)
                stats["heatmap"][square_name] = stats["heatmap"].get(square_name, 0) + 1
                    
                # Missed Mates
                if best_move_san and "#" in best_move_san and "#" not in played_move_san:
                    stats["tactical_themes"]["missed_mates"] += 1
                    
                # Blundered Mates
                if eval_score == 100.0 or eval_score == -100.0:
                    stats["tactical_themes"]["blundered_mates"] += 1
                    
                # Hanging Pieces
                moved_square = move.to_square
                enemy_attackers = board.attackers(board.turn, moved_square)
                friendly_defenders = board.attackers(not board.turn, moved_square)
                if len(enemy_attackers) > len(friendly_defenders):
                    stats["tactical_themes"]["hanging_pieces"] += 1

    stats["rating_trend"].sort(key=lambda x: x["date"])
    stats["accuracy_trend"].sort(key=lambda x: x["date"])
    
    return stats
