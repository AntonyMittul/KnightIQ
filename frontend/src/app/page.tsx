"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { PanelLeft, LogOut, RefreshCcw, ServerCrash, LayoutDashboard, Database, Swords, Flame, TrendingUp, AlertTriangle, Target, Clock, ShieldAlert, Bot, Send, BookOpen, CheckSquare, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Home() {
  const { data: session, status } = useSession();
  const [chessUsername, setChessUsername] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("chessUsername");
    if (saved) setChessUsername(saved);
  }, []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [games, setGames] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [timeControl, setTimeControl] = useState("rapid");
  const [trainingPlan, setTrainingPlan] = useState<any>(null);
  const [trainingPlanLoading, setTrainingPlanLoading] = useState(false);
  const [trainingHistory, setTrainingHistory] = useState<any[]>([]);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [reportView, setReportView] = useState("weekly");

  const fetchGames = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await api.get(`/users/${session.user.email}/games?time_class=${timeControl}`);
      setGames(res.data);
    } catch (err) {
      console.error("Could not fetch games", err);
    }
  };

  const fetchPatterns = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await api.get(`/users/${session.user.email}/patterns?time_class=${timeControl}`);
      if (res.data && !res.data.message) {
        setPatterns(res.data);
      } else {
        setPatterns(null);
      }
    } catch (err) {
      console.error("Could not fetch patterns", err);
    }
  };

  const fetchTrainingHistory = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await api.get(`/coach/${session.user.email}/training/history`);
      setTrainingHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchGames();
      fetchPatterns();
      fetchTrainingHistory();
      setTrainingPlan(null); // Invalidate training plan cache when time control changes
      if (activeTab === 'training') {
        fetchTrainingPlan();
      }
    }
  }, [session, timeControl]);

  const fetchTrainingPlan = async () => {
    if (!session?.user?.email) return;
    setTrainingPlanLoading(true);
    try {
      const res = await api.get(`/coach/${session.user.email}/training-plan?time_class=${timeControl}`);
      if (res.data && !res.data.message) {
        setTrainingPlan(res.data);
      } else {
        setTrainingPlan(null);
      }
    } catch (err) {
      console.error("Could not fetch training plan", err);
    }
    setTrainingPlanLoading(false);
  };
  
  const handleCompleteTraining = async () => {
    if (!session?.user?.email) return;
    try {
      await api.post(`/coach/${session.user.email}/training/complete`);
      fetchTrainingHistory();
      alert("Training marked as complete for today! Great job!");
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'training' && !trainingPlan && !trainingPlanLoading) {
      fetchTrainingPlan();
    }
  }, [activeTab]);

  const handleSync = async () => {
    if (!chessUsername) return;
    setLoading(true);
    setMessage("");
    try {
      localStorage.setItem("chessUsername", chessUsername);
      await api.post(`/users/login`, {
        email: session?.user?.email,
        name: session?.user?.name
      });
      await api.post(`/users/${session?.user?.email}/sync-chess?chess_username=${chessUsername}`);
      setMessage("Sync started! Your entire game history is being downloaded in the background.");
      setIsEditingAccount(false);
      
      let polls = 0;
      const interval = setInterval(() => {
        fetchGames();
        polls++;
        if (polls > 10) clearInterval(interval);
      }, 2000);
    } catch (error: any) {
      const errDetail = error.response?.data?.detail || "Failed to start sync.";
      setMessage(errDetail);
    }
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    setMessage("");
    try {
      await api.post(`/users/${session.user.email}/analyze-games`);
      setMessage("Analysis started! Stockfish is crunching the evaluations.");
      
      let polls = 0;
      const interval = setInterval(() => {
        fetchGames();
        fetchPatterns();
        polls++;
        if (polls > 60) clearInterval(interval);
      }, 3000);
    } catch (error: any) {
      const errDetail = error.response?.data?.detail || "Failed to start analysis.";
      setMessage(errDetail);
    }
    setLoading(false);
  };

  const handleLiveRefresh = async () => {
    if (!session?.user?.email) {
      fetchGames();
      fetchPatterns();
      return;
    }
    setRefreshingLive(true);
    try {
      const res = await api.post(`/users/${session.user.email}/refresh-live`);
      const newGames = res.data?.new_games || 0;
      
      await fetchGames();
      await fetchPatterns();
      
      if (newGames > 0) {
        let polls = 0;
        const interval = setInterval(() => {
          fetchGames();
          fetchPatterns();
          polls++;
          if (polls > 10) clearInterval(interval);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      fetchGames();
      fetchPatterns();
    }
    setRefreshingLive(false);
  };

  const handleChat = async (messageOverride?: string) => {
    const msg = messageOverride || chatInput;
    if (!msg || !session?.user?.email) return;
    
    const newMessages = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    
    try {
      const res = await api.post(`/coach/${session.user.email}/chat`, { message: msg });
      setChatMessages([...newMessages, { role: "assistant", content: res.data.response }]);
    } catch (err) {
      setChatMessages([...newMessages, { role: "assistant", content: "Sorry, I couldn't connect to the coach API right now." }]);
    }
    setChatLoading(false);
  };

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">Loading...</div>;
  }

  if (!session) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 sm:p-24 bg-[#09090b] overflow-hidden">
        {/* Subtle Checkerboard Pattern */}
        <div 
          className="absolute top-0 left-0 w-full h-full opacity-[0.02] pointer-events-none" 
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, #ffffff 25%, transparent 25%, transparent 75%, #ffffff 75%, #ffffff), repeating-linear-gradient(45deg, #ffffff 25%, #09090b 25%, #09090b 75%, #ffffff 75%, #ffffff)`,
            backgroundPosition: `0 0, 40px 40px`,
            backgroundSize: `80px 80px`,
            maskImage: `radial-gradient(circle at 0% 0%, black 0%, transparent 60%)`,
            WebkitMaskImage: `radial-gradient(circle at 0% 0%, black 0%, transparent 60%)`
          }}
        />

        {/* Large Centered Knight Logo Watermark */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] md:w-[1200px] md:h-[1200px] opacity-[0.03] pointer-events-none">
          <img src="/logo.png" alt="KnightIQ Background" className="w-full h-full object-contain filter grayscale brightness-200" />
        </div>

        {/* Center Content */}
        <div className="relative z-10 text-center space-y-6 max-w-2xl">
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-white mb-2">
            KnightIQ
          </h1>
          <p className="text-lg text-zinc-400 mx-auto leading-relaxed max-w-md">
            Discover recurring patterns, eliminate blunders, and master your chess game with AI-driven insights.
          </p>
          <div className="pt-6 flex flex-col sm:flex-row gap-4 items-center justify-center">
            <button
              onClick={() => signIn("google")}
              className="px-6 py-3 rounded-xl bg-white text-black font-semibold flex items-center gap-3 hover:bg-zinc-200 transition-colors shadow-lg"
            >
              <img src="https://authjs.dev/img/providers/google.svg" alt="Google" className="w-5 h-5" />
              Continue with Google
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Aggregate Data for Charts
  const ratingData = patterns?.rating_trend?.map((t: any, i: number) => ({ name: i, rating: t.rating })) || [];
  const accuracyData = patterns?.accuracy_trend?.map((t: any, i: number) => ({ name: i, accuracy: t.accuracy })) || [];
  
  const phaseData = patterns ? [
    { name: 'Opening', blunders: patterns.blunders_by_phase.opening, fill: '#3b82f6' },
    { name: 'Middlegame', blunders: patterns.blunders_by_phase.middlegame, fill: '#10b981' },
    { name: 'Endgame', blunders: patterns.blunders_by_phase.endgame, fill: '#f59e0b' },
  ] : [];

  const tacticsData = patterns ? [
    { name: 'Missed Forks', count: patterns.tactical_themes.missed_forks },
    { name: 'Missed Pins', count: patterns.tactical_themes.missed_pins },
    { name: 'Missed Skewers', count: patterns.tactical_themes.missed_skewers },
    { name: 'Hanging Pieces', count: patterns.tactical_themes.hanging_pieces },
    { name: 'Missed Mates', count: patterns.tactical_themes.missed_mates },
    { name: 'Blundered Mates', count: patterns.tactical_themes.blundered_mates },
    { name: 'Early Q Attacks', count: patterns.tactical_themes.early_queen_attacks },
    { name: 'Weak King Safety', count: patterns.tactical_themes.weak_king_safety },
    { name: 'Delayed Castle', count: patterns.tactical_themes.delayed_castling },
    { name: 'Time Scramble', count: patterns.tactical_themes.time_pressure_blunders },
  ].sort((a,b) => b.count - a.count) : [];

  // Opening Leaderboard (Top 5)
  const openingsArray = patterns?.opening_performance ? Object.entries(patterns.opening_performance).map(([name, stats]: [string, any]) => ({
    name,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    total: stats.wins + stats.losses + stats.draws,
    winRate: Math.round((stats.wins / (stats.wins + stats.losses + stats.draws)) * 100)
  })).sort((a, b) => b.total - a.total).slice(0, 10) : [];

  // Heatmap rendering
  const ChessHeatmap = ({ data }: { data: any }) => {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    const maxVal = Math.max(...Object.values(data || {a1: 0}) as number[]);
    
    return (
      <div className="grid grid-cols-8 gap-0 border border-zinc-700 w-full max-w-sm mx-auto rounded-lg overflow-hidden shadow-2xl shadow-red-900/10">
        {ranks.map(r => files.map(f => {
          const sq = f+r;
          const count = data ? data[sq] || 0 : 0;
          const intensity = maxVal > 0 ? count / maxVal : 0;
          const isDark = (files.indexOf(f) + ranks.indexOf(r)) % 2 !== 0;
          
          return (
            <div key={sq} className="aspect-square flex items-center justify-center relative"
                 style={{ backgroundColor: isDark ? '#3f3f46' : '#d4d4d8' }}>
              <div className="absolute inset-0 transition-opacity" style={{backgroundColor: `rgba(239, 68, 68, ${intensity * 0.85})`}} />
              {count > 0 && <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-md">{count}</span>}
            </div>
          );
        }))}
      </div>
    );
  };

  const TimeControlToggle = () => (
    <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-1 rounded-xl flex gap-1 shadow-lg h-full">
      {["rapid", "blitz"].map(tc => (
        <button 
          key={tc} 
          onClick={() => setTimeControl(tc)}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all capitalize ${timeControl === tc ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
        >
          {tc}
        </button>
      ))}
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-lg border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="KnightIQ Logo" className="w-8 h-8 object-contain drop-shadow-md brightness-110" />
          <h1 className="text-xl font-bold tracking-tight">KnightIQ</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-zinc-400">
            <span className="text-white font-medium">{session.user?.name}</span>
          </div>
          <button onClick={() => signOut()} className="p-2 bg-zinc-900 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`border-r border-zinc-800 bg-zinc-950/50 flex flex-col hidden md:flex transition-all duration-300 ease-in-out relative z-40 overflow-y-auto overflow-x-hidden ${isSidebarExpanded ? 'w-64 p-4 gap-2' : 'w-20 p-4 gap-2 items-center'}`}
        >
          <div className={`flex items-center mb-4 transition-all duration-300 w-full ${isSidebarExpanded ? 'justify-between px-2' : 'justify-center'}`}>
            <span className={`text-xs font-bold text-zinc-500 uppercase tracking-wider transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarExpanded ? 'max-w-[100px] opacity-100' : 'max-w-0 opacity-0'}`}>Menu</span>
            <button 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} 
              className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
              title="Toggle Sidebar"
            >
              <PanelLeft size={20} />
            </button>
          </div>

          <button onClick={() => setActiveTab("overview")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'overview' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="Analytics Dashboard">
            <LayoutDashboard size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>Analytics Dashboard</span>
          </button>
          
          <button onClick={() => setActiveTab("coach")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'coach' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="AI Coach">
            <Bot size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>AI Coach</span>
          </button>
          
          <button onClick={() => setActiveTab("training")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'training' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="Training Plan">
            <BookOpen size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>Training Plan</span>
          </button>
          
          <button onClick={() => setActiveTab("progress")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'progress' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="Progress Reports">
            <TrendingUp size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>Progress Reports</span>
          </button>
          
          <button onClick={() => setActiveTab("openings")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'openings' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="Deep Insights">
            <Target size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>Deep Insights</span>
          </button>
          
          <button onClick={() => setActiveTab("database")} className={`flex items-center py-3 rounded-xl font-medium transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'px-4 gap-3 justify-start w-full' : 'px-0 gap-0 justify-center w-12 mx-auto'} ${activeTab === 'database' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`} title="Game Database">
            <Database size={20} className="flex-shrink-0" /> 
            <span className={`whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>Game Database</span>
          </button>

          {activeTab === 'overview' && (
            <div className="mt-auto w-full relative">
              <div className={`grid transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 shadow-lg mt-4 w-[220px]">
                  {games.length > 0 && !isEditingAccount ? (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold whitespace-nowrap">Account</h3>
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold px-2 py-1 rounded">Connected</span>
                      </div>
                      <div className="text-zinc-300 text-sm font-medium mb-3 truncate flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                        {chessUsername || "Synced"}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSync} disabled={loading || !chessUsername} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50" title="Resync Games">
                           {loading ? <RefreshCcw className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
                        </button>
                        <button onClick={handleAnalyze} disabled={loading || !chessUsername} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center shadow-emerald-900/50 shadow-lg disabled:opacity-50" title="Run AI Analysis">
                           <Bot size={14} />
                        </button>
                      </div>
                      {message && <div className="text-[10px] mt-2 text-center text-zinc-400 truncate">{message}</div>}
                      <button onClick={() => setIsEditingAccount(true)} className="w-full mt-3 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline">Change Account</button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-semibold mb-3 whitespace-nowrap">Sync Account</h3>
                      <input type="text" value={chessUsername} onChange={(e) => setChessUsername(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-2" placeholder="Username" />
                      <button onClick={handleSync} disabled={loading || !chessUsername} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-2 disabled:opacity-50 whitespace-nowrap">
                        {loading ? <RefreshCcw className="animate-spin flex-shrink-0" size={12} /> : <RefreshCcw size={12} className="flex-shrink-0" />} Sync Games
                      </button>
                      <button onClick={handleAnalyze} disabled={loading || !chessUsername} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-emerald-900/50 shadow-lg disabled:opacity-50 whitespace-nowrap">
                        Analyze with AI
                      </button>
                      {message && <div className="text-[10px] mt-2 text-center text-zinc-400 truncate">{message}</div>}
                      {games.length > 0 && (
                        <button onClick={() => setIsEditingAccount(false)} className="w-full mt-2 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline">Cancel</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={`grid transition-all duration-300 ease-in-out ${!isSidebarExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
              <div className="overflow-hidden flex flex-col gap-3 items-center justify-center w-full">
                <button onClick={handleSync} disabled={loading || !chessUsername} className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors disabled:opacity-50 flex-shrink-0" title="Sync Games">
                  {loading ? <RefreshCcw className="animate-spin" size={20} /> : <RefreshCcw size={20} />}
                </button>
                <button onClick={handleAnalyze} disabled={loading || !chessUsername} className="w-12 h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors shadow-emerald-900/50 shadow-lg disabled:opacity-50 flex-shrink-0" title="Analyze with AI">
                  <Bot size={20} />
                </button>
              </div>
            </div>
          </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Performance Overview</h2>
                  <p className="text-zinc-400 mt-1">Macro trends and aggregated statistics over your recent games.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <TimeControlToggle />
                  <button onClick={handleLiveRefresh} disabled={refreshingLive} className="h-[46px] px-4 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 text-sm font-bold shadow-lg disabled:opacity-50">
                    <RefreshCcw size={16} className={refreshingLive ? "animate-spin" : ""} /> {refreshingLive ? "Syncing Live..." : "Refresh Data"}
                  </button>
                </div>
              </div>

              {/* Top Stats Row */}
              {patterns && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Database size={48} /></div>
                    <div className="text-sm font-medium text-zinc-400 mb-1">Analyzed Games</div>
                    <div className="text-3xl font-bold">{patterns.total_analyzed_games}</div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-900/40 to-zinc-900 border border-blue-900/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20"><TrendingUp size={48} className="text-blue-400" /></div>
                    <div className="text-sm font-medium text-blue-300 mb-1">Win Rate</div>
                    <div className="text-3xl font-bold text-white">
                      {Math.round((patterns.win_loss.wins / (patterns.win_loss.wins + patterns.win_loss.losses || 1)) * 100)}%
                    </div>
                    <div className="text-xs text-blue-400/80 mt-1">{patterns.win_loss.wins}W - {patterns.win_loss.losses}L</div>
                  </div>
                  <div className="bg-gradient-to-br from-red-900/20 to-zinc-900 border border-red-900/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20"><AlertTriangle size={48} className="text-red-400" /></div>
                    <div className="text-sm font-medium text-red-300 mb-1">Total Blunders</div>
                    <div className="text-3xl font-bold text-white">{patterns.total_blunders}</div>
                    <div className="text-xs text-red-400/80 mt-1">Severe (-300 CPL) mistakes</div>
                  </div>
                  
                  {/* Weekly Insight Card */}
                  <div className="bg-gradient-to-br from-purple-900/30 to-zinc-900 border border-purple-900/40 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-purple-300 mb-2">
                      <Flame size={16} /> Weekly Insight
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      You are bleeding accuracy in the <strong className="text-white">{
                        Object.keys(patterns.blunders_by_phase).reduce((a, b) => patterns.blunders_by_phase[a] > patterns.blunders_by_phase[b] ? a : b)
                      }</strong>. You've missed a fork <strong className="text-white">{patterns.tactical_themes.missed_forks}</strong> times recently. Time to practice tactics!
                    </p>
                  </div>
                </div>
              )}

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><TrendingUp size={18} className="text-blue-400"/> Rating Trend</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ratingData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis stroke="#a1a1aa" fontSize={12} domain={['dataMin - 100', 'dataMax + 100']} />
                        <Tooltip contentStyle={{backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                        <Line type="monotone" dataKey="rating" stroke="#3b82f6" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Target size={18} className="text-emerald-400"/> Accuracy Trend</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={accuracyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis stroke="#a1a1aa" fontSize={12} domain={[0, 100]} />
                        <Tooltip contentStyle={{backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                        <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'openings' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Deep Insights & Patterns</h2>
                  <p className="text-zinc-400 mt-1">Micro-analysis of your specific weaknesses, opening traps, and positional blunders.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <TimeControlToggle />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Blunder Phase Distribution */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Clock size={18} className="text-amber-400"/> Blunders by Game Phase</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={phaseData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={12} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#27272a'}} contentStyle={{backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                        <Bar dataKey="blunders" radius={[0, 8, 8, 0]}>
                          {phaseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Blunder Heatmap */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Flame size={18} className="text-red-500"/> Blunder Heatmap</h3>
                  <div className="flex-1 flex items-center justify-center">
                    <ChessHeatmap data={patterns?.heatmap} />
                  </div>
                </div>

                {/* Tactical Theme Frequency */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl lg:col-span-2">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><ShieldAlert size={18} className="text-rose-400"/> Mistake Frequency (Tactical Themes)</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tacticsData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} angle={-45} textAnchor="end" height={60} />
                        <YAxis stroke="#a1a1aa" fontSize={12} />
                        <Tooltip cursor={{fill: '#27272a'}} contentStyle={{backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} />
                        <Bar dataKey="count" fill="#e11d48" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Opening Performance */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl lg:col-span-2">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Swords size={18} className="text-indigo-400"/> Top Openings Performance</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-zinc-400">
                      <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
                        <tr>
                          <th className="px-6 py-3 rounded-tl-lg">Opening</th>
                          <th className="px-6 py-3">Total Played</th>
                          <th className="px-6 py-3">Win Rate</th>
                          <th className="px-6 py-3 text-emerald-400">Wins</th>
                          <th className="px-6 py-3 text-red-400">Losses</th>
                          <th className="px-6 py-3 rounded-tr-lg">Draws</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openingsArray.map((op: any, i: number) => (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-4 font-medium text-white max-w-[200px] truncate" title={op.name}>{op.name}</td>
                            <td className="px-6 py-4">{op.total}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${op.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{op.winRate}%</span>
                                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${op.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{width: `${op.winRate}%`}} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">{op.wins}</td>
                            <td className="px-6 py-4">{op.losses}</td>
                            <td className="px-6 py-4">{op.draws}</td>
                          </tr>
                        ))}
                        {openingsArray.length === 0 && (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-500">No opening data available.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Game Database</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <TimeControlToggle />
                  <button onClick={handleLiveRefresh} disabled={refreshingLive} className="h-[46px] px-4 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 text-sm font-bold shadow-lg disabled:opacity-50">
                    <RefreshCcw size={16} className={refreshingLive ? "animate-spin" : ""} /> {refreshingLive ? "Syncing..." : "Refresh"}
                  </button>
                </div>
              </div>

              {games.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-800">
                  <ServerCrash size={32} className="mb-3 opacity-50" />
                  <p className="font-medium text-white">No games found locally.</p>
                  <p className="text-sm mt-1">Sync your account using the sidebar to download PGNs.</p>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-zinc-950/50 border-b border-zinc-800 text-sm text-emerald-400 font-medium flex items-center gap-2">
                    <Database size={14} /> Local database contains {games.length} games.
                  </div>
                  <div className="space-y-1 p-2 max-h-[700px] overflow-y-auto custom-scrollbar">
                    {games.map((game, i) => (
                      <div key={i} className="flex justify-between items-center p-4 hover:bg-zinc-800/50 rounded-xl transition-colors group">
                        <div className="flex flex-col">
                          <span className="font-semibold text-white text-sm">
                            {game.white} <span className="text-zinc-500 text-xs mx-1">({game.white_rating})</span> 
                            <span className="text-zinc-600 mx-2">vs</span> 
                            {game.black} <span className="text-zinc-500 text-xs mx-1">({game.black_rating})</span>
                          </span>
                          <span className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-2">
                            <span className="uppercase bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">{game.time_control}</span>
                            <span className="capitalize">{game.time_class}</span>
                            {game.opening_name && <span className="text-blue-400/80 capitalize truncate max-w-[200px]">• {game.opening_name}</span>}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-sm font-bold ${game.result === '1-0' ? 'text-blue-400' : game.result === '0-1' ? 'text-red-400' : 'text-zinc-400'}`}>
                            {game.result}
                          </span>
                          {game.accuracy != null ? (
                            <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800">
                                Acc: <span className={game.accuracy > 80 ? 'text-emerald-400' : game.accuracy > 50 ? 'text-yellow-400' : 'text-red-400'}>{game.accuracy}%</span>
                              </span>
                              <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800">
                                Blunders: <span className={game.blunders === 0 ? 'text-emerald-400' : 'text-red-400'}>{game.blunders}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] uppercase font-bold text-zinc-600 bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800/50">Unanalyzed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'coach' && (
            <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6">
                <h2 className="text-3xl font-bold tracking-tight">KnightIQ Coach</h2>
                <p className="text-zinc-400 mt-1">Chat with Gemini, powered by your actual Stockfish analytics.</p>
              </div>

              <div className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 custom-scrollbar">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-4xl mx-auto">
                      <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-4">How can I help you improve?</h3>
                      <p className="max-w-xl text-base mb-12 text-zinc-400 leading-relaxed">
                        I have analyzed all your games in the database. I know your blunders, opening traps, and tactical blind spots. Choose a topic below or ask me anything.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        {["What is my biggest weakness?", "How do I stop hanging pieces?", "Give me a training plan for the endgame.", "What opening should I play?"].map(suggestion => (
                          <button key={suggestion} onClick={() => handleChat(suggestion)} className="flex items-center justify-between bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 px-6 py-5 rounded-2xl text-sm font-medium transition-all border border-zinc-800 hover:border-zinc-700 shadow-sm group text-left">
                            <span>{suggestion}</span>
                            <Send size={16} className="text-zinc-700 group-hover:text-white transition-colors flex-shrink-0 ml-4" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto space-y-8">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-3xl px-6 py-4 ${msg.role === 'user' ? 'bg-white text-zinc-950 rounded-tr-sm shadow-md' : 'bg-zinc-900 text-zinc-200 rounded-tl-sm border border-zinc-800'}`}>
                            {msg.role === 'user' ? (
                              <p className="text-sm font-medium">{msg.content}</p>
                            ) : (
                              <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex gap-4 justify-start">
                          <div className="bg-zinc-900 text-zinc-400 rounded-3xl rounded-tl-sm px-6 py-5 border border-zinc-800 flex items-center gap-2 shadow-sm">
                            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="p-4 pb-6 bg-zinc-950/80 backdrop-blur-md">
                  <div className="relative max-w-4xl mx-auto">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !chatLoading && handleChat()}
                      placeholder="Ask your coach for personalized advice..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-6 pr-14 py-4 text-sm focus:outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-500 shadow-inner text-white"
                    />
                    <button 
                      onClick={() => handleChat()}
                      disabled={!chatInput || chatLoading}
                      className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-white hover:bg-zinc-200 text-black disabled:bg-zinc-800 disabled:text-zinc-600 rounded-full transition-colors"
                    >
                      <Send size={16} className={chatLoading ? "animate-pulse" : ""} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'training' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Your Daily Training Plan</h2>
                  <p className="text-zinc-400 mt-1">AI-generated checklist based on your specific weaknesses.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <TimeControlToggle />
                  <button onClick={fetchTrainingPlan} disabled={trainingPlanLoading} className="h-[46px] px-4 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 text-sm font-bold shadow-lg">
                    {trainingPlanLoading ? <RefreshCcw size={16} className="animate-spin" /> : <RefreshCcw size={16} />} Refresh Plan
                  </button>
                </div>
              </div>

              {trainingPlanLoading && !trainingPlan ? (
                <div className="flex flex-col items-center justify-center h-64 bg-zinc-900/50 rounded-2xl border border-zinc-800 border-dashed">
                  <RefreshCcw size={32} className="animate-spin text-emerald-500 mb-4" />
                  <p className="text-zinc-400">Gemini is analyzing your stats and generating your plan...</p>
                </div>
              ) : trainingPlan ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Focus Areas */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl lg:col-span-1">
                    <h3 className="text-lg font-bold mb-4">Core Focus Areas</h3>
                    <div className="space-y-3">
                      {trainingPlan.focus_areas?.map((focus: string, i: number) => (
                        <div key={i} className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50">
                          <span className="text-sm text-zinc-300 leading-relaxed">{focus}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tactics to Solve */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl lg:col-span-2">
                    <h3 className="text-lg font-bold mb-4">Tactics to Solve Today</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {trainingPlan.tactics_to_solve?.map((tactic: any, i: number) => (
                        <a key={i} href={tactic.url} target="_blank" rel="noopener noreferrer" className="block p-4 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-blue-500 hover:bg-zinc-900 transition-all group">
                          <div className="mb-2">
                            <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{tactic.theme}</span>
                          </div>
                          <p className="text-xs text-zinc-500">Practice this specific theme on Lichess.</p>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Opening Suggestions */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl lg:col-span-3">
                    <h3 className="text-lg font-bold mb-4">Opening Lab</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {trainingPlan.opening_suggestions?.map((opening: any, i: number) => (
                        <div key={i} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                          <h4 className="font-bold text-emerald-400 mb-2">{opening.name}</h4>
                          <p className="text-sm text-zinc-400 leading-relaxed">{opening.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-800">
                  <p>No training plan available. Please sync your games first.</p>
                </div>
              )}
              
              {trainingPlan && (
                <div className="mt-8 flex justify-end">
                  <button onClick={handleCompleteTraining} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/50">
                    Mark Training as Complete
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'progress' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Performance Tracking</h2>
                  <p className="text-zinc-400 mt-1">Measure your improvement over time with weekly and monthly reports.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-1 rounded-xl flex gap-1 shadow-lg h-full">
                    {["weekly", "monthly"].map(v => (
                      <button 
                        key={v} 
                        onClick={() => setReportView(v)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all capitalize ${reportView === v ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <TimeControlToggle />
                </div>
              </div>

              {/* Monthly Reports */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><TrendingUp size={18} className="text-blue-400"/> {reportView === 'weekly' ? 'Weekly Reports' : 'Monthly Reports'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {reportView === 'monthly' ? (
                    <>
                      {patterns?.monthly_reports && Object.entries(patterns.monthly_reports).sort().reverse().map(([month, data]: any) => (
                        <div key={month} className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 hover:border-blue-500/50 transition-colors">
                          <div className="font-bold text-xl mb-4 text-white">{new Date(month + "-01").toLocaleDateString('default', { month: 'long', year: 'numeric' })}</div>
                          <div className="space-y-3 text-sm text-zinc-400">
                            <div className="flex justify-between"><span className="text-zinc-500">Games Played</span><span className="font-medium text-white">{data.games}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Win Rate</span><span className="font-medium text-emerald-400">{Math.round((data.wins / (data.wins + data.losses || 1)) * 100)}%</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Total Blunders</span><span className="font-medium text-red-400">{data.blunders}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Blunders/Game</span><span className="font-medium text-orange-400">{(data.blunders / (data.games || 1)).toFixed(1)}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Avg Accuracy</span><span className="font-medium text-blue-400">{data.accuracy_count > 0 ? (data.accuracy_sum / data.accuracy_count).toFixed(1) : 0}%</span></div>
                          </div>
                        </div>
                      ))}
                      {(!patterns?.monthly_reports || Object.keys(patterns.monthly_reports).length === 0) && (
                        <p className="text-zinc-500">No monthly data available.</p>
                      )}
                    </>
                  ) : (
                    <>
                      {patterns?.weekly_reports && Object.entries(patterns.weekly_reports).sort().reverse().map(([week, data]: any) => (
                        <div key={week} className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 hover:border-blue-500/50 transition-colors">
                          <div className="font-bold text-xl mb-4 text-white">{week.replace('-W', ' Week ')}</div>
                          <div className="space-y-3 text-sm text-zinc-400">
                            <div className="flex justify-between"><span className="text-zinc-500">Games Played</span><span className="font-medium text-white">{data.games}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Win Rate</span><span className="font-medium text-emerald-400">{Math.round((data.wins / (data.wins + data.losses || 1)) * 100)}%</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Total Blunders</span><span className="font-medium text-red-400">{data.blunders}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Blunders/Game</span><span className="font-medium text-orange-400">{(data.blunders / (data.games || 1)).toFixed(1)}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Avg Accuracy</span><span className="font-medium text-blue-400">{data.accuracy_count > 0 ? (data.accuracy_sum / data.accuracy_count).toFixed(1) : 0}%</span></div>
                          </div>
                        </div>
                      ))}
                      {(!patterns?.weekly_reports || Object.keys(patterns.weekly_reports).length === 0) && (
                        <p className="text-zinc-500">No weekly data available.</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Training Streak */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><CheckSquare size={18} className="text-emerald-400"/> Training Completion History</h3>
                <div className="flex flex-wrap gap-2">
                  {trainingHistory.map((log: any, i: number) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]" title={log.date}>
                        <CheckSquare size={18} />
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 font-bold">{new Date(log.date).getDate()} {new Date(log.date).toLocaleString('default', { month: 'short' })}</span>
                    </div>
                  ))}
                  {trainingHistory.length === 0 && <p className="text-zinc-500 text-sm">No training sessions completed yet. Head over to the Training Plan tab to start your streak!</p>}
                </div>
              </div>

            </div>
          )}

        </main>
      </div>
    </main>
  );
}
