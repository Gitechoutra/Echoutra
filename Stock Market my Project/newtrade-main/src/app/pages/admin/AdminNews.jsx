import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Search, Edit2, Trash2, Eye, X, AlertCircle,
  CheckCircle, RefreshCw, Newspaper, TrendingUp, Star,
  Zap, Clock, Tag, Link2, Image, AlignLeft, Loader2,
  Globe, ChevronLeft, ChevronRight,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

/* FIX: include Content-Type only for write operations, not GETs */
const authHdr = (withJson = false) => ({
  Authorization:  `Bearer ${getToken()}`,
  ...(withJson ? { "Content-Type": "application/json" } : {}),
});

/* ── Sentiment options ─────────────────────────────────────────────────────── */
const SENTIMENTS = ["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"];
const SENT_COLOR = {
  POSITIVE: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  NEGATIVE: "text-red-400    bg-red-500/10    border-red-500/20",
  NEUTRAL:  "text-gray-400   bg-gray-500/10   border-gray-500/20",
  MIXED:    "text-amber-400  bg-amber-500/10  border-amber-500/20",
};

/* ── Empty article form ────────────────────────────────────────────────────── */
const EMPTY = {
  title:        "",
  summary:      "",
  content:      "",
  author:       "Market Desk",
  source_name:  "",
  source_url:   "",
  image_url:    "",
  sentiment:    "NEUTRAL",
  category:     "",           // category name string (not ID)
  tags:         "",           // comma-separated string; split on submit
  is_breaking:  false,
  is_featured:  false,
  published_at: new Date().toISOString().slice(0, 16),
  stock_ids:    [],
};

/* ── Small toast ───────────────────────────────────────────────────────────── */
function Toast({ msg, ok, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`fixed top-24 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-medium ${
        ok ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-300"
           : "bg-red-900/80    border-red-500/30    text-red-300"}`}
    >
      {ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

/* ── Field wrapper ─────────────────────────────────────────────────────────── */
function Field({ label, required, hint, error, children }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-gray-700 ml-1.5">({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function AdminNews() {

  /* ── List state ─────────────────────────────────────────────────────────── */
  const [articles,    setArticles]    = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [stocks,      setStocks]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [total,       setTotal]       = useState(0);
  const [search,      setSearch]      = useState("");
  const [sentFilter,  setSentFilter]  = useState("All");
  const [featFilter,  setFeatFilter]  = useState("All");

  /* ── Modal state ─────────────────────────────────────────────────────────── */
  const [showModal,   setShowModal]   = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState(EMPTY);
  const [formErr,     setFormErr]     = useState({});
  const [saving,      setSaving]      = useState(false);

  /* ── Delete confirm ──────────────────────────────────────────────────────── */
  const [deleteId,    setDeleteId]    = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  /* ── Preview panel ───────────────────────────────────────────────────────── */
  const [previewArticle, setPreviewArticle] = useState(null);

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => setToast({ msg, ok });

  /* ── Stock search for tagging ────────────────────────────────────────────── */
  const [stockSearch,   setStockSearch]   = useState("");
  const [stockDropOpen, setStockDropOpen] = useState(false);

  /* ─────────────────────────────────────────────────────────────────────────
     DATA FETCHERS
  ───────────────────────────────────────────────────────────────────────── */

  /* FIX: GET /market_news/categories returns category name strings, not objects */
  const fetchCategories = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/market_news/categories`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        const raw = data.response?.categories || data.response || [];
        /* May be array of strings or array of objects */
        setCategories(
          raw.map((c) => (typeof c === "string" ? c : c.category_name || c.name || c))
        );
      }
    } catch {}
  }, []);

  /* FIX: per_page not limit */
  const fetchStocks = useCallback(async (q = "") => {
    try {
      const params = new URLSearchParams({ per_page: 20 });
      if (q) params.set("search", q);
      const res  = await fetch(`${API_BASE}/stocks/list?${params}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setStocks(data.response?.stocks || []);
    } catch {}
  }, []);

  /* News list — uses GET /market_news/list (USER-readable, admin-accessible) */
  const fetchArticles = useCallback(async (pg = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: pg, per_page: 12 });
      if (search)                    params.set("search",      search);
      if (sentFilter !== "All")      params.set("sentiment",   sentFilter);
      if (featFilter === "Featured") params.set("is_featured", "true");
      if (featFilter === "Breaking") params.set("is_breaking", "true");

      const res  = await fetch(`${API_BASE}/market_news/list?${params}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        /* Backend may return news under .news, .articles, or .data */
        const items = data.response?.news
          || data.response?.articles
          || data.response?.data
          || (Array.isArray(data.response) ? data.response : []);
        setArticles(items);
        setTotal(data.response?.total || items.length);
        setTotalPages(data.response?.total_pages || data.response?.pages || 1);
      } else {
        setError(data.response?.message || "Failed to load news.");
      }
    } catch {
      setError("Network error — could not load articles.");
    } finally {
      setLoading(false);
    }
  }, [search, sentFilter, featFilter]);

  useEffect(() => { fetchCategories(); fetchStocks(); }, []);
  useEffect(() => { setPage(1); fetchArticles(1); }, [search, sentFilter, featFilter]);

  useEffect(() => {
    if (stockSearch.length >= 1) fetchStocks(stockSearch);
    else                          fetchStocks();
  }, [stockSearch]);

  /* ─────────────────────────────────────────────────────────────────────────
     FORM HELPERS
  ───────────────────────────────────────────────────────────────────────── */

  const setF = (field, value) => {
    setForm(p => ({ ...p, [field]: value }));
    if (formErr[field]) setFormErr(p => ({ ...p, [field]: "" }));
  };

  const openCreate = () => {
    setForm({ ...EMPTY, published_at: new Date().toISOString().slice(0, 16) });
    setFormErr({});
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (article) => {
    /*
      Map existing article back to form fields.
      Note: category may be a string or object from the list endpoint.
    */
    const catName = typeof article.category === "string"
      ? article.category
      : article.category?.category_name || article.category?.name || "";

    setForm({
      title:        article.title        || "",
      summary:      article.summary      || "",
      content:      article.content      || "",
      author:       article.author       || "Market Desk",
      source_name:  article.source_name  || article.source || "",
      source_url:   article.source_url   || "",
      image_url:    article.image_url    || "",
      sentiment:    article.sentiment    || "NEUTRAL",
      category:     catName,
      tags:         (article.tags || []).join(", "),
      is_breaking:  article.is_breaking  || false,
      is_featured:  article.is_featured  || false,
      published_at: article.published_at
        ? article.published_at.slice(0, 16).replace(" ", "T")
        : new Date().toISOString().slice(0, 16),
      stock_ids: (article.related_stocks || []).map(s => s.stock_id),
    });
    setFormErr({});
    setEditId(article.news_id);
    setShowModal(true);
  };

  const validateForm = () => {
    const errs = {};
    if (!form.title.trim())   errs.title   = "Title is required.";
    if (!form.summary.trim()) errs.summary = "Summary is required.";
    return errs;
  };

  /* ─────────────────────────────────────────────────────────────────────────
     SAVE — CREATE  →  POST /market_news/create   (ADMIN API ✓)
             EDIT   →  PUT  /market_news/<id>     (ADMIN API ✓)

     FIX: PUT now sends ALL editable fields, not just 5.
          Both endpoints require JSON body + Authorization header.
  ───────────────────────────────────────────────────────────────────────── */
  const handleSave = async () => {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErr(errs); return; }
    setSaving(true);

    try {
      /* Build tags array */
      const tagsArr = form.tags
        .split(",")
        .map(t => t.trim().toUpperCase())
        .filter(Boolean);

      /* Shared editable fields for both create and update */
      const sharedPayload = {
        title:        form.title.trim(),
        summary:      form.summary.trim(),
        content:      form.content.trim(),
        author:       form.author.trim() || "Market Desk",
        source_name:  form.source_name.trim(),
        source_url:   form.source_url.trim(),
        image_url:    form.image_url.trim(),
        sentiment:    form.sentiment,
        is_breaking:  form.is_breaking,
        is_featured:  form.is_featured,
        is_active:    true,
        tags:         tagsArr,
        stock_ids:    form.stock_ids,
        published_at: form.published_at
          ? new Date(form.published_at).toISOString().replace("T", " ").slice(0, 19)
          : undefined,
      };

      /* Only include category if selected */
      if (form.category) sharedPayload.category = form.category;

      let res;
      if (editId) {
        /*
          PUT /market_news/<news_id>  — ADMIN API
          Sends the full payload so all fields can be updated.
        */
        res = await fetch(`${API_BASE}/market_news/${editId}`, {
          method:  "PUT",
          headers: authHdr(true),
          body:    JSON.stringify(sharedPayload),
        });
      } else {
        /*
          POST /market_news/create  — ADMIN API
          Creates a new article visible to all users immediately.
        */
        res = await fetch(`${API_BASE}/market_news/create`, {
          method:  "POST",
          headers: authHdr(true),
          body:    JSON.stringify(sharedPayload),
        });
      }

      const data = await res.json();
      if (!data.bool) {
        showToast(data.response?.message || "Failed to save article.", false);
        return;
      }

      showToast(editId ? "Article updated." : "Article published! Users can now see it.", true);
      setShowModal(false);
      fetchArticles(page);
    } catch {
      showToast("Network error — please try again.", false);
    } finally {
      setSaving(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     DELETE  →  DELETE /market_news/<news_id>  (ADMIN API ✓)
  ───────────────────────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res  = await fetch(`${API_BASE}/market_news/${deleteId}`, {
        method:  "DELETE",
        headers: authHdr(),
      });
      const data = await res.json();
      if (!data.bool) {
        showToast(data.response?.message || "Delete failed.", false);
        return;
      }
      showToast("Article removed.");
      setDeleteId(null);
      /* Go back one page if this was the last article on current page */
      const newPage = articles.length === 1 && page > 1 ? page - 1 : page;
      setPage(newPage);
      fetchArticles(newPage);
    } catch {
      showToast("Network error.", false);
    } finally {
      setDeleting(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     STOCK TAG HELPERS
  ───────────────────────────────────────────────────────────────────────── */
  const addStock = (stock) => {
    if (!form.stock_ids.includes(stock.stock_id)) {
      setF("stock_ids", [...form.stock_ids, stock.stock_id]);
    }
    setStockSearch("");
    setStockDropOpen(false);
  };

  const removeStock = (stockId) => {
    setF("stock_ids", form.stock_ids.filter(id => id !== stockId));
  };

  const getStockLabel = (id) => {
    const s = stocks.find(s => s.stock_id === id);
    return s ? `${s.ticker_symbol} — ${s.company_name}` : `Stock #${id}`;
  };

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER HELPERS
  ───────────────────────────────────────────────────────────────────────── */
  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return d.slice(0, 10); }
  };

  const getCatName = (cat) => {
    if (!cat) return "General";
    if (typeof cat === "string") return cat;
    return cat.category_name || cat.name || "General";
  };

  /* Filtered stocks for dropdown */
  const filteredStocksForTag = stocks.filter(
    s =>
      !form.stock_ids.includes(s.stock_id) &&
      (s.ticker_symbol?.toLowerCase().includes(stockSearch.toLowerCase()) ||
       s.company_name?.toLowerCase().includes(stockSearch.toLowerCase()))
  );

  /* ─────────────────────────────────────────────────────────────────────────
     MAIN RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Market News</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Publish and manage news articles visible to all users
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchArticles(page)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20"
          >
            <Plus className="w-4 h-4" /> Publish Article
          </button>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="bg-violet-500/8 border border-violet-500/20 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Globe className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-violet-300 mb-0.5">How news reaches users</div>
          <div className="text-xs text-gray-500">
            Click <strong className="text-violet-300">Publish Article</strong> → fill the form →
            click <strong className="text-violet-300">Publish to Users</strong>.
            The article immediately appears in the <strong className="text-violet-300">UserNews</strong> page via
            <code className="mx-1 text-xs bg-white/10 px-1 py-0.5 rounded">GET /market_news/list</code>.
            Tag stocks to appear in per-stock pages and the user's personalised "My Stocks" feed.
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Articles", value: total,                                   icon: Newspaper, color: "text-violet-400", border: "border-violet-500/15" },
          { label: "Featured",       value: articles.filter(a => a.is_featured).length, icon: Star,   color: "text-amber-400",  border: "border-amber-500/15"  },
          { label: "Breaking",       value: articles.filter(a => a.is_breaking).length, icon: Zap,    color: "text-red-400",    border: "border-red-500/15"    },
          { label: "Categories",     value: categories.length,                        icon: Tag,      color: "text-cyan-400",   border: "border-cyan-500/15"   },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className={`bg-[#0C1220] border ${s.border} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", "Featured", "Breaking"].map(f => (
            <button key={f} onClick={() => setFeatFilter(f)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border transition-all ${
                featFilter === f
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-white/8 text-gray-600 hover:text-white"
              }`}>
              {f === "Featured" && <Star className="w-3 h-3" />}
              {f === "Breaking" && <Zap className="w-3 h-3" />}
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...SENTIMENTS].map(s => (
            <button key={s} onClick={() => setSentFilter(s)}
              className={`px-3 py-2 text-xs rounded-xl border transition-all ${
                sentFilter === s
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-white/8 text-gray-600 hover:text-white"
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Articles grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-[#0C1220] border border-white/5 rounded-2xl">
          <Newspaper className="w-12 h-12 text-gray-700" />
          <div className="text-gray-500 text-sm">No articles yet</div>
          <button
            onClick={openCreate}
            className="px-5 py-2 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-all"
          >
            Publish Your First Article
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((a, i) => (
            <motion.div
              key={a.news_id || i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-colors group"
            >
              {/* Thumbnail */}
              {a.image_url ? (
                <div className="h-36 overflow-hidden bg-[#141C30]">
                  <img
                    src={a.image_url} alt={a.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={e => { e.target.parentNode.style.display = "none"; }}
                  />
                </div>
              ) : (
                <div className="h-24 bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-b border-white/5 flex items-center justify-center">
                  <Newspaper className="w-8 h-8 text-violet-500/30" />
                </div>
              )}

              <div className="p-4">
                {/* Badges */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-gray-600">{getCatName(a.category)}</span>
                  {a.is_featured && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400">
                      <Star className="w-2.5 h-2.5" /> Featured
                    </span>
                  )}
                  {a.is_breaking && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                      <Zap className="w-2.5 h-2.5" /> Breaking
                    </span>
                  )}
                  {a.sentiment && (
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${SENT_COLOR[a.sentiment] || SENT_COLOR.NEUTRAL}`}>
                      {a.sentiment}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-white leading-snug mb-2 line-clamp-2">{a.title}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 mb-3">{a.summary}</p>

                <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                  <Clock className="w-3 h-3" />
                  {fmtDate(a.published_at)}
                  {(a.source_name || a.source) && (
                    <><span>·</span><span>{a.source_name || a.source}</span></>
                  )}
                </div>

                {/* Tags */}
                {a.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {a.tags.slice(0, 3).map((t, j) => (
                      <span key={j} className="text-xs px-1.5 py-0.5 bg-white/5 border border-white/8 rounded text-gray-500">#{t}</span>
                    ))}
                    {a.tags.length > 3 && <span className="text-xs text-gray-700">+{a.tags.length - 3}</span>}
                  </div>
                )}

                {/* Related stocks */}
                {a.related_stocks?.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp className="w-3 h-3 text-cyan-400" />
                    <div className="flex gap-1 flex-wrap">
                      {a.related_stocks.slice(0, 3).map((s, j) => (
                        <span key={j} className="text-xs px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400">
                          {s.ticker_symbol}
                        </span>
                      ))}
                      {a.related_stocks.length > 3 && (
                        <span className="text-xs text-gray-700">+{a.related_stocks.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => setPreviewArticle(a)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-all"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => setDeleteId(a.news_id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 hover:bg-red-500/20 transition-all ml-auto"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchArticles(p); }}
            disabled={page === 1}
            className="p-1.5 rounded-lg bg-[#141C30] border border-white/8 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total} articles</span>
          <button
            onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchArticles(p); }}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg bg-[#141C30] border border-white/8 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════ DELETE CONFIRM ══════════════ */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-red-500/20 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Delete Article</div>
                  <div className="text-xs text-gray-500">This will hide the article from all users immediately.</div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════ PREVIEW MODAL ══════════════ */}
      <AnimatePresence>
        {previewArticle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
                <span className="text-sm font-bold text-white">Article Preview</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">As seen by users</span>
                  <button onClick={() => setPreviewArticle(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {previewArticle.image_url && (
                  <img src={previewArticle.image_url} alt="" className="w-full h-48 object-cover rounded-xl" />
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">{getCatName(previewArticle.category)}</span>
                  {previewArticle.is_featured && <span className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400">★ Featured</span>}
                  {previewArticle.is_breaking && <span className="text-xs px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-400">⚡ Breaking</span>}
                  {previewArticle.sentiment && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${SENT_COLOR[previewArticle.sentiment] || SENT_COLOR.NEUTRAL}`}>
                      {previewArticle.sentiment}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-white leading-snug">{previewArticle.title}</h2>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>{previewArticle.author || "Market Desk"}</span>
                  {(previewArticle.source_name || previewArticle.source) && (
                    <><span>·</span><span>{previewArticle.source_name || previewArticle.source}</span></>
                  )}
                  <span>·</span>
                  <span>{fmtDate(previewArticle.published_at)}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{previewArticle.summary}</p>
                {previewArticle.content && (
                  <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{previewArticle.content}</p>
                )}
                {previewArticle.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                    {previewArticle.tags.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-white/5 border border-white/8 rounded text-gray-500">#{t}</span>
                    ))}
                  </div>
                )}
                {previewArticle.source_url && (
                  <a href={previewArticle.source_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                    <Link2 className="w-3 h-3" /> Read original article
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════ CREATE / EDIT MODAL ══════════════ */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0C1220] border border-violet-500/20 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-700/30 border border-violet-500/20 flex items-center justify-center">
                    <Newspaper className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">
                      {editId ? "Edit Article" : "Publish New Article"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {editId
                        ? "Updates all fields via PUT /market_news/" + editId
                        : "Published immediately via POST /market_news/create"}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* ── Content section ── */}
                <div>
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-violet-500/40" />Content<span className="flex-1 h-px bg-violet-500/10" />
                  </p>
                  <div className="space-y-4">
                    <Field label="Headline" required error={formErr.title}>
                      <input
                        type="text"
                        value={form.title}
                        onChange={e => setF("title", e.target.value)}
                        placeholder="e.g. Reliance Industries Reports Record Q3 Profits"
                        className={`w-full bg-[#141C30] border rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors ${formErr.title ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`}
                      />
                    </Field>
                    <Field label="Summary" required hint="2–3 sentence teaser shown in the list" error={formErr.summary}>
                      <textarea
                        value={form.summary}
                        onChange={e => setF("summary", e.target.value)}
                        placeholder="e.g. Reliance Industries posted a 15% jump in net profit for Q3 FY25…"
                        rows={3}
                        className={`w-full bg-[#141C30] border rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors resize-none ${formErr.summary ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`}
                      />
                    </Field>
                    <Field label="Full Content" hint="shown when user expands the article">
                      <textarea
                        value={form.content}
                        onChange={e => setF("content", e.target.value)}
                        placeholder="Full article body…"
                        rows={5}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors resize-none"
                      />
                    </Field>
                  </div>
                </div>

                {/* ── Source & Author ── */}
                <div>
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-violet-500/40" />Source & Author<span className="flex-1 h-px bg-violet-500/10" />
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Author">
                      <div className="relative">
                        <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="text" value={form.author} onChange={e => setF("author", e.target.value)}
                          placeholder="Market Desk"
                          className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
                      </div>
                    </Field>
                    <Field label="Source Name">
                      <input type="text" value={form.source_name} onChange={e => setF("source_name", e.target.value)}
                        placeholder="e.g. Economic Times"
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
                    </Field>
                    <Field label="Source URL" hint="link to original">
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="url" value={form.source_url} onChange={e => setF("source_url", e.target.value)}
                          placeholder="https://example.com/article"
                          className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
                      </div>
                    </Field>
                    <Field label="Image URL">
                      <div className="relative">
                        <Image className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="url" value={form.image_url} onChange={e => setF("image_url", e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
                      </div>
                    </Field>
                  </div>
                </div>

                {/* ── Classification ── */}
                <div>
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-violet-500/40" />Classification<span className="flex-1 h-px bg-violet-500/10" />
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* FIX: categories are strings, not objects */}
                    <Field label="Category">
                      <select
                        value={form.category}
                        onChange={e => setF("category", e.target.value)}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors"
                      >
                        <option value="">— Select category —</option>
                        {categories.map((c, i) => (
                          <option key={i} value={typeof c === "string" ? c : c.category_name}>
                            {typeof c === "string" ? c : c.category_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sentiment">
                      <select
                        value={form.sentiment}
                        onChange={e => setF("sentiment", e.target.value)}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors"
                      >
                        {SENTIMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Publish Date & Time">
                      <input
                        type="datetime-local"
                        value={form.published_at}
                        onChange={e => setF("published_at", e.target.value)}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors"
                      />
                    </Field>
                    <Field label="Tags" hint="comma-separated, auto-uppercased">
                      <input
                        type="text"
                        value={form.tags}
                        onChange={e => setF("tags", e.target.value)}
                        placeholder="RELIANCE, EARNINGS, NSE"
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors"
                      />
                    </Field>
                  </div>

                  {/* Feature flags */}
                  <div className="flex items-center gap-6 mt-4">
                    {[
                      { label: "Featured", desc: "Shown at top of news feed",   v: form.is_featured, f: "is_featured", icon: Star },
                      { label: "Breaking", desc: "Highlighted with ⚡ badge",    v: form.is_breaking, f: "is_breaking", icon: Zap  },
                    ].map(({ label, desc, v, f, icon: Icon }) => (
                      <label key={f} className="flex items-start gap-2.5 cursor-pointer">
                        <div
                          className={`mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 relative cursor-pointer ${v ? "bg-violet-500" : "bg-white/10"}`}
                          onClick={() => setF(f, !v)}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${v ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                        <div>
                          <div className="text-sm text-white flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-violet-400" />{label}
                          </div>
                          <div className="text-xs text-gray-600">{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Tag stocks ── */}
                <div>
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-violet-500/40" />Tag Related Stocks
                    <span className="text-gray-700 font-normal normal-case tracking-normal text-xs">
                      (appears in per-stock news feeds)
                    </span>
                    <span className="flex-1 h-px bg-violet-500/10" />
                  </p>

                  {form.stock_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {form.stock_ids.map(id => (
                        <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300">
                          <TrendingUp className="w-3 h-3" />
                          {getStockLabel(id)}
                          <button onClick={() => removeStock(id)} className="text-cyan-500 hover:text-white ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                    <input
                      type="text"
                      value={stockSearch}
                      onChange={e => { setStockSearch(e.target.value); setStockDropOpen(true); }}
                      onFocus={() => setStockDropOpen(true)}
                      onBlur={() => setTimeout(() => setStockDropOpen(false), 200)}
                      placeholder="Search and tag stocks (e.g. RELIANCE, AAPL)…"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
                    />
                    {stockDropOpen && filteredStocksForTag.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#0C1220] border border-white/10 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                        {filteredStocksForTag.map(s => (
                          <div
                            key={s.stock_id}
                            onMouseDown={() => addStock(s)}
                            className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0"
                          >
                            <div>
                              <span className="text-sm font-bold text-white">{s.ticker_symbol}</span>
                              <span className="text-xs text-gray-500 ml-2">{s.company_name}</span>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0 bg-[#0A0C1E]">
                <p className="text-xs text-gray-600">
                  Fields marked <span className="text-red-400">*</span> are required
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-60 shadow-lg shadow-violet-500/20"
                  >
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" />{editId ? "Saving…" : "Publishing…"}</>
                      : <><Newspaper className="w-4 h-4" />{editId ? "Save Changes" : "Publish to Users"}</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}



























