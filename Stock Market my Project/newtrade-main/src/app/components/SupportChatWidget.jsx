import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, Headphones } from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

/**
 * Floating support chat widget for the user portal.
 * - Bottom-right bubble with an unread badge.
 * - Polls the thread every 4s while open, and the unread count every 15s while closed,
 *   so admin replies appear in (near) real time.
 */
export function SupportChatWidget() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft,    setDraft]    = useState("");
  const [sending,  setSending]  = useState(false);
  const [unread,   setUnread]   = useState(0);
  const bottomRef = useRef(null);

  const fetchThread = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res  = await fetch(`${API_BASE}/support/thread`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        setMessages(data.response?.messages || []);
        setUnread(0); // opening the thread marks admin msgs read server-side
      }
    } catch { /* silent */ }
  }, []);

  const fetchUnread = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res  = await fetch(`${API_BASE}/support/unread_count`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setUnread(data.response?.unread_count || 0);
    } catch { /* silent */ }
  }, []);

  // Poll unread badge while closed
  useEffect(() => {
    if (open) return;
    fetchUnread();
    const id = setInterval(fetchUnread, 15000);
    return () => clearInterval(id);
  }, [open, fetchUnread]);

  // Poll the thread while open (real-time admin replies)
  useEffect(() => {
    if (!open) return;
    fetchThread();
    const id = setInterval(fetchThread, 4000);
    return () => clearInterval(id);
  }, [open, fetchThread]);

  // Auto-scroll to newest message
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    // optimistic append
    const optimistic = { message_id: `tmp-${Date.now()}`, sender_role: "USER", message: text, created_on: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    try {
      const res  = await fetch(`${API_BASE}/support/send`, {
        method: "POST", headers: authHdr(), body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.bool) fetchThread();
    } catch { /* keep optimistic message */ }
    finally { setSending(false); }
  };

  const fmtTime = (s) => {
    try { return new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <>
      {/* Launcher bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30 flex items-center justify-center text-white hover:scale-105 transition-transform"
        aria-label="Support chat"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center border-2 border-[#07091A]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-[60] w-[92vw] max-w-sm h-[70vh] max-h-[520px] bg-[#0C1220] border border-cyan-500/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/15 to-blue-600/10 border-b border-white/5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Headphones className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">TradeFlow Support</div>
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> We reply here
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <MessageCircle className="w-8 h-8 text-cyan-500/40 mb-2" />
                  <p className="text-sm text-gray-400">Send us a message</p>
                  <p className="text-xs text-gray-600 mt-1">Our team will reply as soon as possible.</p>
                </div>
              )}
              {messages.map((m) => {
                const mine = m.sender_role === "USER";
                return (
                  <div key={m.message_id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                      mine
                        ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-sm"
                        : "bg-[#141C30] border border-white/8 text-gray-200 rounded-bl-sm"
                    }`}>
                      {!mine && <div className="text-[10px] font-semibold text-cyan-400 mb-0.5">Support</div>}
                      <div className="whitespace-pre-wrap break-words">{m.message}</div>
                      <div className={`text-[10px] mt-1 ${mine ? "text-white/60" : "text-gray-500"}`}>{fmtTime(m.created_on)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-white/5 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type a message…"
                className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/30"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white disabled:opacity-50 hover:opacity-90 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
