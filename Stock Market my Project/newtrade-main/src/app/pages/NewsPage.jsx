import { useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  TrendingUp,
  Bookmark,
  Share2,
  ExternalLink,
  Clock,
} from "lucide-react";
import { newsItems } from "../data/mockData";

const categories = [
  "All",
  "Markets",
  "Technology",
  "Macro",
  "Energy",
  "Financials",
  "Auto",
];

const featuredNews = {
  title:
    "Federal Reserve Signals Potential Rate Cuts as Inflation Cools to Near Target",
  summary:
    "Federal Reserve officials have increasingly signaled that interest rate cuts may be on the horizon as key inflation metrics move closer to the central bank's 2% target. Fed Chair Jerome Powell indicated in recent communications that the committee is monitoring economic data closely, with particular attention to labor market conditions and consumer spending patterns. Markets have responded with optimism, driving major indices to new highs.",
  source: "Reuters",
  time: "2h ago",
  category: "Macro",
  author: "Sarah Chen",
  readTime: "5 min read",
};

const marketMovers = [
  { symbol: "NVDA", pct: "+2.19%", reason: "AI demand surge" },
  { symbol: "AMZN", pct: "+1.97%", reason: "AWS growth beats" },
  { symbol: "TSLA", pct: "-3.27%", reason: "Delivery miss" },
  { symbol: "META", pct: "-0.64%", reason: "Ad spend concerns" },
];

export function NewsPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [bookmarked, setBookmarked] = useState([]);
  const [expandedNews, setExpandedNews] = useState(null);

  const filtered = newsItems.filter((news) => {
    const matchCat =
      selectedCategory === "All" || news.category === selectedCategory;
    const matchSearch =
      news.title.toLowerCase().includes(search.toLowerCase()) ||
      news.summary.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const toggleBookmark = (id, e) => {
    e.stopPropagation();
    setBookmarked((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  };

  const categoryColors = {
    Macro: "bg-blue-500/10 text-blue-400",
    Technology: "bg-cyan-500/10 text-cyan-400",
    Markets: "bg-purple-500/10 text-purple-400",
    Energy: "bg-amber-500/10 text-amber-400",
    Financials: "bg-emerald-500/10 text-emerald-400",
    Auto: "bg-red-500/10 text-red-400",
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Market News</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stay updated with the latest financial news
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Live Feed</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Featured Story */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-[#0F1E35] to-[#0A0E1A] border border-cyan-500/20 rounded-xl p-6 cursor-pointer hover:border-cyan-500/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400 uppercase tracking-wide">
                Featured Story
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[featuredNews.category]}`}
              >
                {featuredNews.category}
              </span>
            </div>

            <h2 className="text-lg font-bold text-white mb-3 leading-snug">
              {featuredNews.title}
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              {featuredNews.summary}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="text-gray-400 font-medium">
                  {featuredNews.source}
                </span>
                <span>·</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {featuredNews.time}
                </div>
                <span>·</span>
                <span>{featuredNews.readTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors">
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors">
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Filters */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search news..."
                className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap border transition-all ${
                    selectedCategory === cat
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                      : "border-[#1E2D4A] bg-[#0A0E1A] text-gray-500 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* News List */}
          <div className="space-y-3">
            {filtered.map((news, i) => (
              <motion.div
                key={news.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() =>
                  setExpandedNews(expandedNews === news.id ? null : news.id)
                }
                className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5 cursor-pointer hover:border-white/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[news.category] || "bg-gray-500/10 text-gray-400"}`}
                      >
                        {news.category}
                      </span>
                      <span className="text-xs text-gray-600">
                        {news.source}
                      </span>
                      <span className="text-xs text-gray-700">·</span>
                      <span className="text-xs text-gray-600">{news.time}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white leading-snug mb-2">
                      {news.title}
                    </h3>
                    {expandedNews === news.id && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-sm text-gray-500 leading-relaxed"
                      >
                        {news.summary}
                      </motion.p>
                    )}
                    {expandedNews !== news.id && (
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {news.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => toggleBookmark(news.id, e)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          bookmarked.includes(news.id)
                            ? "text-amber-400 bg-amber-500/10"
                            : "text-gray-600 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Bookmark
                          className={`w-3.5 h-3.5 ${bookmarked.includes(news.id) ? "fill-amber-400" : ""}`}
                        />
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {filtered.length === 0 && (
              <div className="py-12 text-center text-gray-600 text-sm">
                No news matches your filters
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Market Movers */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#1E2D4A] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-white">
                Today's Movers
              </span>
            </div>
            <div className="divide-y divide-[#1E2D4A]/50">
              {marketMovers.map((m) => (
                <div
                  key={m.symbol}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-bold text-white">
                      {m.symbol}
                    </div>
                    <div className="text-xs text-gray-600">{m.reason}</div>
                  </div>
                  <div
                    className={`text-sm font-medium ${m.pct.startsWith("+") ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {m.pct}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bookmarked */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#1E2D4A] flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Bookmarked</span>
              <span className="ml-auto text-xs text-gray-600">
                {bookmarked.length}
              </span>
            </div>
            {bookmarked.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-700">
                Bookmark articles to read later
              </div>
            ) : (
              <div className="divide-y divide-[#1E2D4A]/50">
                {newsItems
                  .filter((n) => bookmarked.includes(n.id))
                  .map((news) => (
                    <div
                      key={news.id}
                      className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <div className="text-xs text-white leading-snug line-clamp-2">
                        {news.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {news.source} · {news.time}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Trending topics */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-4">
            <div className="text-sm font-medium text-white mb-3">
              Trending Topics
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Federal Reserve",
                "AI Stocks",
                "Earnings Season",
                "Interest Rates",
                "Tech Rally",
                "Oil Prices",
                "S&P 500",
                "Crypto",
              ].map((topic) => (
                <button
                  key={topic}
                  onClick={() => setSearch(topic)}
                  className="px-3 py-1.5 bg-[#1A2235] border border-[#1E2D4A] rounded-full text-xs text-gray-400 hover:text-white hover:border-white/20 transition-all"
                >
                  #{topic.replace(" ", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Economic Calendar */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#1E2D4A]">
              <span className="text-sm font-medium text-white">
                Economic Calendar
              </span>
            </div>
            <div className="divide-y divide-[#1E2D4A]/50">
              {[
                { event: "CPI Report", date: "May 8", impact: "High" },
                { event: "FOMC Minutes", date: "May 10", impact: "High" },
                { event: "Retail Sales", date: "May 12", impact: "Medium" },
                { event: "Jobs Report", date: "May 14", impact: "High" },
              ].map((event) => (
                <div
                  key={event.event}
                  className="px-4 py-2.5 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs text-white">{event.event}</div>
                    <div className="text-xs text-gray-600">{event.date}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      event.impact === "High"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {event.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
