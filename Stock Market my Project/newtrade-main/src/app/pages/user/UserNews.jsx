import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Search, Bookmark, Share2, TrendingUp, Clock, AlertCircle, RefreshCw } from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr = () => ({ Authorization: `Bearer ${getToken()}` });

const catColors = {
  Macro: "bg-blue-500/10 text-blue-400",
  Technology: "bg-cyan-500/10 text-cyan-400",
  Markets: "bg-violet-500/10 text-violet-400",
  Energy: "bg-amber-500/10 text-amber-400",
  Financials: "bg-emerald-500/10 text-emerald-400",
  Auto: "bg-red-500/10 text-red-400",
};

export function UserNews() {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [bookmarked, setBookmarked] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [newsItems, setNewsItems] = useState([]);
  const [categories, setCategories] = useState(["All"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [myStocksNews, setMyStocksNews] = useState([]);
  const [myStocks, setMyStocks] = useState([]);
  
  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${API_BASE}/market_news/categories`, { headers: authHdr() });
        const data = await res.json();
        console.log("Categories API response:", data);
        
        if (data.bool && data.response?.categories) {
          // Extract category names - handle both string and object formats
          const categoryNames = data.response.categories.map(catItem => {
            // If it's an object with category_name property
            if (typeof catItem === 'object' && catItem !== null) {
              return catItem.category_name || catItem.name || String(catItem);
            }
            // If it's a string
            return String(catItem);
          });
          setCategories(["All", ...categoryNames]);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
        // Fallback to default categories
        setCategories(["All", "Markets", "Technology", "Macro", "Energy", "Financials", "Auto"]);
      }
    };
    fetchCategories();
  }, []);

  // Fetch news items
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (cat !== "All") params.set("category", cat);
      if (search) params.set("search", search);
      
      const res = await fetch(`${API_BASE}/market_news/list?${params}`, { headers: authHdr() });
      const data = await res.json();
      
      console.log("News API response:", data);
      
      if (!data.bool) {
        setError(data.response?.message || "Failed to load news.");
        setLoading(false);
        return;
      }
      
      const news = data.response?.news || data.response?.data || [];
      setNewsItems(news);
    } catch (err) {
      console.error("Network error:", err);
      setError("Network error loading news.");
    } finally {
      setLoading(false);
    }
  }, [cat, search]);

  // Fetch my stocks news (for sidebar trending)
  const fetchMyStocksNews = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/market_news/my_stocks`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response?.news) {
        setMyStocksNews(data.response.news.slice(0, 5));
      }
    } catch (err) {
      console.error("Failed to fetch my stocks news:", err);
    }
  }, []);

  // Fetch my holdings for sidebar
  const fetchMyHoldings = useCallback(async () => {
    try {
      const portRes = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      const portData = await portRes.json();
      if (portData.bool && portData.response?.portfolios?.length > 0) {
        const firstPortfolio = portData.response.portfolios[0];
        const holdingsRes = await fetch(`${API_BASE}/portfolios/${firstPortfolio.portfolio_id}`, { headers: authHdr() });
        const holdingsData = await holdingsRes.json();
        if (holdingsData.bool && holdingsData.response?.holdings) {
          setMyStocks(holdingsData.response.holdings.slice(0, 5));
        }
      }
    } catch (err) {
      console.error("Failed to fetch holdings:", err);
    }
  }, []);

  // Fetch bookmarked news from user preferences
  const fetchBookmarked = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user_preferences/me`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response?.bookmarked_news) {
        setBookmarked(data.response.bookmarked_news);
      }
    } catch (err) {
      console.error("Failed to fetch bookmarks:", err);
    }
  }, []);

  // Save bookmarked news to user preferences
  const saveBookmarked = useCallback(async (newBookmarked) => {
    try {
      const res = await fetch(`${API_BASE}/user_preferences/me`, {
        method: "PUT",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarked_news: newBookmarked })
      });
      const data = await res.json();
      if (!data.bool) {
        console.error("Failed to save bookmarks:", data.response?.message);
      }
    } catch (err) {
      console.error("Failed to save bookmarks:", err);
    }
  }, []);

  // Toggle bookmark
  const toggleBookmark = (newsId, e) => {
    e.stopPropagation();
    setBookmarked(prev => {
      const newBookmarked = prev.includes(newsId)
        ? prev.filter(id => id !== newsId)
        : [...prev, newsId];
      saveBookmarked(newBookmarked);
      return newBookmarked;
    });
  };

  // Refresh all data
  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchNews(), fetchMyStocksNews(), fetchMyHoldings(), fetchBookmarked()]);
    setRefreshing(false);
  };

  // Initial load
  useEffect(() => {
    refreshAll();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNews();
    }, 300);
    return () => clearTimeout(timer);
  }, [cat, search, fetchNews]);

  const filtered = newsItems;
  const featuredNews = newsItems[0];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Market News</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stay updated with the latest financial news
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/15 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Live Feed</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          {/* Featured */}
          {featuredNews && !loading && (
            <div className="bg-gradient-to-br from-[#0F1E35] to-[#0C1220] border border-cyan-500/15 rounded-2xl p-5 cursor-pointer hover:border-cyan-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs text-cyan-400 uppercase tracking-wide">
                  Featured
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${catColors[featuredNews.category] || "bg-gray-500/10 text-gray-400"}`}>
                  {typeof featuredNews.category === 'object' ? featuredNews.category?.category_name || featuredNews.category?.name || "Markets" : featuredNews.category || "Markets"}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mb-2 leading-snug">
                {featuredNews.title}
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">
                {featuredNews.summary || featuredNews.content?.substring(0, 150)}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{featuredNews.source || "Reuters"}</span>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {featuredNews.published_at ? new Date(featuredNews.published_at).toLocaleTimeString() : "2h ago"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors">
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => toggleBookmark(featuredNews.news_id || featuredNews.id, e)}
                    className={`p-1.5 rounded-lg transition-colors ${bookmarked.includes(featuredNews.news_id || featuredNews.id) ? "text-amber-400 bg-amber-500/10" : "text-gray-600 hover:text-white hover:bg-white/5"}`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${bookmarked.includes(featuredNews.news_id || featuredNews.id) ? "fill-amber-400" : ""}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search news…"
                className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap border transition-all ${cat === c ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-white/8 text-gray-600 hover:text-white"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : (
            filtered.map((n, i) => {
              const newsId = n.news_id || n.id || i;
              const categoryName = typeof n.category === 'object' 
                ? (n.category?.category_name || n.category?.name || "General")
                : (n.category || "General");
              
              return (
                <motion.div
                  key={newsId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setExpanded(expanded === newsId ? null : newsId)}
                  className="bg-[#0C1220] border border-white/5 rounded-2xl p-5 cursor-pointer hover:border-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${catColors[categoryName] || "bg-gray-500/10 text-gray-400"}`}
                        >
                          {categoryName}
                        </span>
                        <span className="text-xs text-gray-600">
                          {n.source || "News Source"} · {n.published_at ? new Date(n.published_at).toLocaleDateString() : n.time || "recent"}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-white mb-2">
                        {n.title}
                      </div>
                      {expanded === newsId ? (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-gray-500 leading-relaxed"
                        >
                          {n.summary || n.content}
                        </motion.p>
                      ) : (
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {n.summary || n.content}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => toggleBookmark(newsId, e)}
                        className={`p-1.5 rounded-lg transition-colors ${bookmarked.includes(newsId) ? "text-amber-400 bg-amber-500/10" : "text-gray-600 hover:text-white hover:bg-white/5"}`}
                      >
                        <Bookmark
                          className={`w-3.5 h-3.5 ${bookmarked.includes(newsId) ? "fill-amber-400" : ""}`}
                        />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-gray-600 text-sm">
              No news articles match your filters
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Movers - My Stocks Today */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-white">
                My Stocks Today
              </span>
            </div>
            {myStocks.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-gray-700">
                No holdings yet. Add stocks to your portfolio.
              </div>
            ) : (
              myStocks.map((holding, i) => (
                <div
                  key={i}
                  className="px-4 py-3 flex items-center justify-between border-b border-white/5 last:border-0"
                >
                  <span className="text-sm font-bold text-white">{holding.ticker_symbol}</span>
                  <span className={`text-sm ${parseFloat(holding.unrealized_pnl_percent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {parseFloat(holding.unrealized_pnl_percent || 0) >= 0 ? "+" : ""}
                    {parseFloat(holding.unrealized_pnl_percent || 0).toFixed(2)}%
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Bookmarks */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/5 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Bookmarked</span>
              <span className="ml-auto text-xs text-gray-600">
                {bookmarked.length}
              </span>
            </div>
            {bookmarked.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-gray-700">
                Bookmark articles to read later
              </div>
            ) : (
              newsItems
                .filter((n) => bookmarked.includes(n.news_id || n.id))
                .map((n) => (
                  <div
                    key={n.news_id || n.id}
                    className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0"
                    onClick={() => setExpanded(expanded === (n.news_id || n.id) ? null : (n.news_id || n.id))}
                  >
                    <div className="text-xs text-white line-clamp-2">
                      {n.title}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {n.source || "News"} · {n.published_at ? new Date(n.published_at).toLocaleDateString() : n.time || "recent"}
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Economic calendar */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/5 text-sm font-medium text-white">
              Economic Calendar
            </div>
            {myStocksNews.length > 0 ? (
              myStocksNews.slice(0, 4).map((news, i) => (
                <div
                  key={i}
                  className="px-4 py-2.5 border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5"
                  onClick={() => window.open(news.url, "_blank")}
                >
                  <div className="text-xs text-white line-clamp-1">{news.title}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {news.source} · {news.published_at ? new Date(news.published_at).toLocaleDateString() : ""}
                  </div>
                </div>
              ))
            ) : (
              [
                { e: "CPI Report", d: "May 8", h: "High" },
                { e: "FOMC Minutes", d: "May 10", h: "High" },
                { e: "Retail Sales", d: "May 12", h: "Medium" },
                { e: "Jobs Report", d: "May 14", h: "High" },
              ].map((ev, i) => (
                <div
                  key={i}
                  className="px-4 py-2.5 flex items-center justify-between border-b border-white/5 last:border-0"
                >
                  <div>
                    <div className="text-xs text-white">{ev.e}</div>
                    <div className="text-xs text-gray-600">{ev.d}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${ev.h === "High" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}
                  >
                    {ev.h}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}






















