import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Search, CheckCircle, Clock, XCircle, ArrowUpDown } from "lucide-react";
import { stocks } from "../data/mockData";

const orderHistory = [
  {
    id: "ORD-001",
    symbol: "AAPL",
    type: "Buy",
    qty: 10,
    price: 185.5,
    total: 1855.0,
    status: "Filled",
    time: "09:32 AM",
    date: "May 6",
  },
  {
    id: "ORD-002",
    symbol: "NVDA",
    type: "Buy",
    qty: 3,
    price: 860.0,
    total: 2580.0,
    status: "Filled",
    time: "10:15 AM",
    date: "May 6",
  },
  {
    id: "ORD-003",
    symbol: "TSLA",
    type: "Sell",
    qty: 5,
    price: 252.3,
    total: 1261.5,
    status: "Filled",
    time: "11:44 AM",
    date: "May 5",
  },
  {
    id: "ORD-004",
    symbol: "META",
    type: "Buy",
    qty: 8,
    price: 490.0,
    total: 3920.0,
    status: "Pending",
    time: "02:10 PM",
    date: "May 5",
  },
  {
    id: "ORD-005",
    symbol: "GOOGL",
    type: "Buy",
    qty: 15,
    price: 142.0,
    total: 2130.0,
    status: "Cancelled",
    time: "01:05 PM",
    date: "May 4",
  },
  {
    id: "ORD-006",
    symbol: "MSFT",
    type: "Sell",
    qty: 4,
    price: 375.0,
    total: 1500.0,
    status: "Filled",
    time: "09:55 AM",
    date: "May 4",
  },
  {
    id: "ORD-007",
    symbol: "JPM",
    type: "Buy",
    qty: 12,
    price: 195.0,
    total: 2340.0,
    status: "Filled",
    time: "11:20 AM",
    date: "May 3",
  },
  {
    id: "ORD-008",
    symbol: "V",
    type: "Buy",
    qty: 6,
    price: 269.5,
    total: 1617.0,
    status: "Filled",
    time: "03:42 PM",
    date: "May 2",
  },
];

export function TradePage() {
  const navigate = useNavigate();
  const [tradeType, setTradeType] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [symbol, setSymbol] = useState("AAPL");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState("day");
  const [searchInput, setSearchInput] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");

  const selectedStock = stocks.find((s) => s.symbol === symbol) || stocks[0];
  const up = selectedStock.changePct >= 0;
  const execPrice =
    orderType === "limit" && limitPrice
      ? parseFloat(limitPrice)
      : selectedStock.price;
  const totalCost = parseFloat(quantity || "0") * execPrice;

  const searchResults = stocks
    .filter(
      (s) =>
        s.symbol.toLowerCase().includes(searchInput.toLowerCase()) ||
        s.name.toLowerCase().includes(searchInput.toLowerCase()),
    )
    .slice(0, 6);

  const filteredHistory = orderHistory.filter(
    (o) =>
      historyFilter === "all" ||
      o.status.toLowerCase() === historyFilter.toLowerCase(),
  );

  const placeOrder = () => {
    setShowConfirm(false);
    setOrderPlaced(true);
    setTimeout(() => setOrderPlaced(false), 4000);
  };

  const statusConfig = {
    Filled: { color: "text-emerald-400", icon: CheckCircle },
    Pending: { color: "text-amber-400", icon: Clock },
    Cancelled: { color: "text-gray-500", icon: XCircle },
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Success toast */}
      <AnimatePresence>
        {orderPlaced && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-6 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl shadow-xl"
          >
            <CheckCircle className="w-5 h-5" />
            <div>
              <div className="text-sm font-medium">
                Order Placed Successfully!
              </div>
              <div className="text-xs text-emerald-500/70">
                {tradeType === "buy" ? "Buy" : "Sell"} {quantity} {symbol} · $
                {totalCost.toLocaleString("en", { maximumFractionDigits: 2 })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h1 className="text-xl font-bold text-white">Trade</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Execute market and limit orders
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Order Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            {/* Buy/Sell */}
            <div className="grid grid-cols-2">
              <button
                onClick={() => setTradeType("buy")}
                className={`py-3.5 text-sm font-medium transition-all ${
                  tradeType === "buy"
                    ? "bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500"
                    : "text-gray-500 hover:text-gray-300 border-b border-[#1E2D4A]"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`py-3.5 text-sm font-medium transition-all ${
                  tradeType === "sell"
                    ? "bg-red-500/10 text-red-400 border-b-2 border-red-500"
                    : "text-gray-500 hover:text-gray-300 border-b border-[#1E2D4A]"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Symbol selector */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Stock Symbol
                </label>
                <div className="relative">
                  <div
                    onClick={() => setShowSearch(!showSearch)}
                    className="flex items-center justify-between bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-3 cursor-pointer hover:border-cyan-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-400">
                          {symbol.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {symbol}
                        </div>
                        <div className="text-xs text-gray-600">
                          {selectedStock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white">
                        ${selectedStock.price.toFixed(2)}
                      </div>
                      <div
                        className={`text-xs ${up ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {up ? "+" : ""}
                        {selectedStock.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Search dropdown */}
                  <AnimatePresence>
                    {showSearch && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-[#0F1629] border border-[#1E2D4A] rounded-xl shadow-2xl z-20 overflow-hidden"
                      >
                        <div className="p-2 border-b border-[#1E2D4A]">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                            <input
                              type="text"
                              value={searchInput}
                              onChange={(e) => setSearchInput(e.target.value)}
                              placeholder="Search..."
                              autoFocus
                              className="w-full bg-[#1A2235] rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {searchResults.map((s) => (
                            <div
                              key={s.symbol}
                              onClick={() => {
                                setSymbol(s.symbol);
                                setShowSearch(false);
                                setSearchInput("");
                              }}
                              className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 cursor-pointer"
                            >
                              <div>
                                <div className="text-sm font-medium text-white">
                                  {s.symbol}
                                </div>
                                <div className="text-xs text-gray-600 truncate max-w-[150px]">
                                  {s.name}
                                </div>
                              </div>
                              <div
                                className={`text-xs ${s.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {s.changePct >= 0 ? "+" : ""}
                                {s.changePct.toFixed(2)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Order type */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Order Type
                </label>
                <div className="flex gap-2">
                  {["market", "limit", "stop-limit"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type)}
                      className={`flex-1 py-2 text-xs rounded-lg capitalize border transition-all ${
                        orderType === type
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-[#1E2D4A] bg-[#1A2235] text-gray-500 hover:text-white"
                      }`}
                    >
                      {type === "stop-limit" ? "Stop" : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Quantity
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="flex-1 bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                  />

                  <div className="flex gap-1">
                    {["5", "10", "25", "50"].map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuantity(q)}
                        className={`px-2.5 py-2.5 text-xs rounded-lg border transition-all ${
                          quantity === q
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-[#1E2D4A] bg-[#1A2235] text-gray-500 hover:text-white"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Limit Price */}
              {orderType !== "market" && (
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">
                    {orderType === "limit" ? "Limit Price" : "Stop Price"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder={selectedStock.price.toFixed(2)}
                      className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Time in Force */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Time in Force
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "day", label: "Day" },
                    { value: "gtc", label: "GTC" },
                    { value: "ioc", label: "IOC" },
                  ].map((tif) => (
                    <button
                      key={tif.value}
                      onClick={() => setTimeInForce(tif.value)}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                        timeInForce === tif.value
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-[#1E2D4A] bg-[#1A2235] text-gray-500 hover:text-white"
                      }`}
                    >
                      {tif.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-[#1A2235] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Est. Price</span>
                  <span className="text-white">${execPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Quantity</span>
                  <span className="text-white">{quantity || 0} shares</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Commission</span>
                  <span className="text-emerald-400">Free</span>
                </div>
                <div className="pt-2 border-t border-[#1E2D4A] flex justify-between">
                  <span className="text-sm text-gray-400">Est. Total</span>
                  <span className="text-sm font-bold text-white">
                    $
                    {totalCost.toLocaleString("en", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="text-xs text-gray-600 text-center">
                Buying Power: <span className="text-white">$24,500.00</span>
              </div>

              <button
                onClick={() => setShowConfirm(true)}
                className={`w-full py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-95 ${
                  tradeType === "buy"
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                }`}
              >
                Place {tradeType === "buy" ? "Buy" : "Sell"} Order
              </button>
            </div>
          </div>
        </div>

        {/* Order History */}
        <div className="lg:col-span-3">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
              <div className="text-sm font-medium text-white">
                Order History
              </div>
              <div className="flex gap-1">
                {["all", "filled", "pending", "cancelled"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-all ${
                      historyFilter === filter
                        ? "bg-white/10 text-white"
                        : "text-gray-600 hover:text-gray-400"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1E2D4A]">
                    {[
                      "Order ID",
                      "Symbol",
                      "Type",
                      "Qty",
                      "Price",
                      "Total",
                      "Status",
                      "Date",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs text-gray-600 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((order, i) => {
                    const status = statusConfig[order.status];
                    return (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-[#1E2D4A]/50 hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => navigate(`/app/stock/${order.symbol}`)}
                      >
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                          {order.id}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-white">
                          {order.symbol}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              order.type === "Buy"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {order.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {order.qty}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          ${order.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          ${order.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className={`flex items-center gap-1.5 text-xs ${status.color}`}
                          >
                            <status.icon className="w-3.5 h-3.5" />
                            {order.status}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-600">
                            {order.date}
                          </div>
                          <div className="text-xs text-gray-700">
                            {order.time}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#0F1629] border border-[#1E2D4A] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="text-center mb-5">
              <div
                className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                  tradeType === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"
                }`}
              >
                <ArrowUpDown
                  className={`w-6 h-6 ${tradeType === "buy" ? "text-emerald-400" : "text-red-400"}`}
                />
              </div>
              <div className="text-lg font-bold text-white">Confirm Order</div>
            </div>

            <div className="bg-[#1A2235] rounded-xl p-4 space-y-2.5 mb-5">
              {[
                ["Action", tradeType === "buy" ? "Buy" : "Sell"],
                ["Symbol", symbol],
                ["Order Type", orderType.toUpperCase()],
                ["Quantity", `${quantity} shares`],
                [
                  "Price",
                  orderType === "market"
                    ? "Market Price"
                    : `$${limitPrice || selectedStock.price.toFixed(2)}`,
                ],
                [
                  "Est. Total",
                  `$${totalCost.toLocaleString("en", { maximumFractionDigits: 2 })}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span
                    className={
                      label === "Action"
                        ? tradeType === "buy"
                          ? "text-emerald-400 font-medium"
                          : "text-red-400 font-medium"
                        : "text-white"
                    }
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="py-2.5 bg-[#1A2235] border border-[#1E2D4A] rounded-xl text-sm text-gray-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={placeOrder}
                className={`py-2.5 rounded-xl text-sm font-medium text-white ${
                  tradeType === "buy"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-red-500 hover:bg-red-600"
                } transition-colors`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
