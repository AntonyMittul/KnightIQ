# KnightIQ

**KnightIQ** is a state-of-the-art, AI-driven chess performance analyzer designed to help players uncover hidden weaknesses, eliminate recurring blunders, and rapidly improve their game. 

By natively integrating with the Chess.com API, Stockfish 16.1, and Google Gemini AI, KnightIQ moves beyond generic chess engines. It acts as your personalized, data-driven chess coach—identifying *why* you are losing and telling you exactly *how* to fix it.

---

## 🚀 Key Features

* **Real-time Data Synchronization**: Seamlessly connects to your public Chess.com profile to securely fetch and store your latest match histories and PGNs.
* **Deep Engine Analysis**: Runs local Stockfish 16.1 analysis to evaluate every single move you make, calculating precise Centipawn Loss (CPL) to categorize inaccuracies, mistakes, and blunders.
* **Advanced Tactical Pattern Detection**: Employs `python-chess` algorithms to reconstruct board states and identify exactly what tactical themes you struggle with (e.g., missed forks, missed pins, delayed castling, weak king safety, and early queen attacks).
* **AI Chess Coach**: Powered by Google Gemini 2.5 Flash, your personalized AI coach is fed your exact statistical weaknesses. You can chat with it to receive direct, actionable, and mathematically-backed advice on your playstyle.
* **Dynamic Training Plans**: Generates highly customized, actionable daily training checklists—recommending specific Lichess puzzle themes and opening studies based on your highest-frequency blunder types.
* **Performance Tracking**: Beautifully visualizes your progression with Weekly and Monthly progress reports, accuracy trends, and dynamic heatmaps, allowing you to track improvements over time across different time controls (Rapid vs. Blitz).

---

## 🛠️ Technology Stack

**Frontend:**
* [Next.js](https://nextjs.org/) (React Framework)
* [TailwindCSS](https://tailwindcss.com/) (Utility-first styling)
* [Recharts](https://recharts.org/) (Data visualization)
* [Lucide React](https://lucide.dev/) (Iconography)

**Backend:**
* [FastAPI](https://fastapi.tiangolo.com/) (High-performance Python API)
* [Stockfish 16.1](https://stockfishchess.org/) (World-class open-source chess engine)
* [Python-Chess](https://python-chess.readthedocs.io/) (Board state reconstruction and move generation)
* [Google GenAI SDK](https://ai.google.dev/) (LLM integration for the AI Coach and Training Planner)
* [SQLite](https://www.sqlite.org/) (Lightweight local database)

---

## ⚙️ How It Works

1. **Fetch**: The backend hits the `api.chess.com` archives to download your actual game data.
2. **Analyze**: The games are parsed into a local SQLite database and fed through a background Stockfish UCI process.
3. **Detect**: The system scans the engine evaluations to find severe evaluation drops (blunders), then uses board heuristics to categorize the exact nature of the mistake.
4. **Coach**: The raw statistical output is securely passed as a System Prompt to Google Gemini, which acts as your private tutor to synthesize the raw engine data into human-readable advice.

---

## 🏃 Getting Started

### Prerequisites
* Node.js (v18+)
* Python (3.10+)
* A valid [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Backend Setup
1. Navigate to the `backend` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate it: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux)
4. Install dependencies: `pip install -r requirements.txt`
5. Create a `.env` file and add your Gemini API Key: `GEMINI_API_KEY=your_api_key_here`
6. Run the Stockfish downloader script to fetch the engine binary: `python download_stockfish.py`
7. Start the FastAPI server: `uvicorn main:app --reload`

### Frontend Setup
1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`
3. Start the Next.js development server: `npm run dev`
4. Open `http://localhost:3000` in your browser.

---

## 🛡️ Privacy

KnightIQ only accesses public Chess.com game archives. Authentication (via Google) is used strictly to secure your dashboard, keeping your customized coaching metrics private to you. Game histories and engine evaluations are stored locally in your own SQLite database.
