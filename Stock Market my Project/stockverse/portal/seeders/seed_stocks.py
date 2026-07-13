
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from portal import db
from portal.models.stocks          import Stocks, StockStatus, AssetType
from portal.models.stock_analytics import StockAnalytics


# ── Stock definitions ─────────────────────────────────────────────────────────
# Fields: ticker, company, short, exchange, sector, industry, country, currency,
#         isin, current_price, prev_close, open_price, day_high, day_low,
#         volume, avg_volume, market_cap, pe_ratio, eps, dividend_yield,
#         beta, week_52_high, week_52_low,
#         logo_url, website_url, description, asset_type, is_featured

STOCKS = [
    # ── NSE / BSE (INR) ───────────────────────────────────────────────────────
    {
        "ticker":        "RELIANCE",
        "company":       "Reliance Industries Limited",
        "short":         "Reliance",
        "exchange":      "NSE",
        "sector":        "Energy",
        "industry":      "Oil & Gas Refining",
        "country":       "India",
        "currency":      "INR",
        "isin":          "INE002A01018",
        "current_price": 2910.75,
        "prev_close":    2875.50,
        "open_price":    2880.00,
        "day_high":      2925.00,
        "day_low":       2865.00,
        "volume":        8_500_000,
        "avg_volume":    9_200_000,
        "market_cap":    19_700_000_000_000,  # ~₹19.7 lakh crore
        "pe_ratio":      28.4,
        "eps":           102.43,
        "dividend_yield":0.35,
        "beta":          0.92,
        "week_52_high":  3_024.90,
        "week_52_low":   2_220.30,
        "logo_url":      "https://logo.clearbit.com/ril.com",
        "website_url":   "https://www.ril.com",
        "description":   "Reliance Industries Limited is India's largest private sector company spanning energy, petrochemicals, retail and telecom.",
        "asset_type":    "STOCK",
        "is_featured":   True,
    },
    {
        "ticker":        "TCS",
        "company":       "Tata Consultancy Services Limited",
        "short":         "TCS",
        "exchange":      "NSE",
        "sector":        "IT Services",
        "industry":      "IT Consulting & Other Services",
        "country":       "India",
        "currency":      "INR",
        "isin":          "INE467B01029",
        "current_price": 3842.60,
        "prev_close":    3810.25,
        "open_price":    3815.00,
        "day_high":      3860.00,
        "day_low":       3800.00,
        "volume":        3_200_000,
        "avg_volume":    3_500_000,
        "market_cap":    13_900_000_000_000,
        "pe_ratio":      31.2,
        "eps":           123.15,
        "dividend_yield":1.56,
        "beta":          0.65,
        "week_52_high":  4_255.00,
        "week_52_low":   3_311.40,
        "logo_url":      "https://logo.clearbit.com/tcs.com",
        "website_url":   "https://www.tcs.com",
        "description":   "Tata Consultancy Services is a global IT services, consulting and business solutions company headquartered in Mumbai.",
        "asset_type":    "STOCK",
        "is_featured":   True,
    },
    # {
    #     "ticker":        "HDFCBANK",
    #     "company":       "HDFC Bank Limited",
    #     "short":         "HDFC Bank",
    #     "exchange":      "NSE",
    #     "sector":        "Financials",
    #     "industry":      "Banks",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE040A01034",
    #     "current_price": 1748.30,
    #     "prev_close":    1729.80,
    #     "open_price":    1735.00,
    #     "day_high":      1758.00,
    #     "day_low":       1722.50,
    #     "volume":        11_000_000,
    #     "avg_volume":    12_500_000,
    #     "market_cap":    13_300_000_000_000,
    #     "pe_ratio":      18.7,
    #     "eps":           93.49,
    #     "dividend_yield":1.20,
    #     "beta":          0.78,
    #     "week_52_high":  1_880.00,
    #     "week_52_low":   1_363.55,
    #     "logo_url":      "https://logo.clearbit.com/hdfcbank.com",
    #     "website_url":   "https://www.hdfcbank.com",
    #     "description":   "HDFC Bank is one of India's leading private sector banks offering a wide range of banking products and financial services.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   True,
    # },
    # {
    #     "ticker":        "INFY",
    #     "company":       "Infosys Limited",
    #     "short":         "Infosys",
    #     "exchange":      "NSE",
    #     "sector":        "IT Services",
    #     "industry":      "IT Consulting & Other Services",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE009A01021",
    #     "current_price": 1582.45,
    #     "prev_close":    1565.80,
    #     "open_price":    1568.00,
    #     "day_high":      1592.00,
    #     "day_low":       1558.00,
    #     "volume":        6_800_000,
    #     "avg_volume":    7_100_000,
    #     "market_cap":    6_560_000_000_000,
    #     "pe_ratio":      25.6,
    #     "eps":           61.81,
    #     "dividend_yield":2.28,
    #     "beta":          0.70,
    #     "week_52_high":  1_903.65,
    #     "week_52_low":   1_358.35,
    #     "logo_url":      "https://logo.clearbit.com/infosys.com",
    #     "website_url":   "https://www.infosys.com",
    #     "description":   "Infosys is a global leader in next-generation digital services and consulting, enabling clients in 56 countries to navigate digital transformation.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "WIPRO",
    #     "company":       "Wipro Limited",
    #     "short":         "Wipro",
    #     "exchange":      "NSE",
    #     "sector":        "IT Services",
    #     "industry":      "IT Consulting & Other Services",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE075A01022",
    #     "current_price": 461.20,
    #     "prev_close":    458.95,
    #     "open_price":    459.50,
    #     "day_high":      465.80,
    #     "day_low":       455.30,
    #     "volume":        5_200_000,
    #     "avg_volume":    5_800_000,
    #     "market_cap":    2_400_000_000_000,
    #     "pe_ratio":      20.1,
    #     "eps":           22.94,
    #     "dividend_yield":0.43,
    #     "beta":          0.68,
    #     "week_52_high":  577.75,
    #     "week_52_low":   401.25,
    #     "logo_url":      "https://logo.clearbit.com/wipro.com",
    #     "website_url":   "https://www.wipro.com",
    #     "description":   "Wipro Limited is a leading technology services and consulting company, delivering innovative solutions across 65+ countries.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "AIRTEL",
    #     "company":       "Bharti Airtel Limited",
    #     "short":         "Airtel",
    #     "exchange":      "NSE",
    #     "sector":        "Communication Services",
    #     "industry":      "Wireless Telecommunication Services",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE397D01024",
    #     "current_price": 1685.40,
    #     "prev_close":    1664.80,
    #     "open_price":    1668.00,
    #     "day_high":      1698.00,
    #     "day_low":       1655.00,
    #     "volume":        4_100_000,
    #     "avg_volume":    4_500_000,
    #     "market_cap":    9_450_000_000_000,
    #     "pe_ratio":      72.4,
    #     "eps":           23.28,
    #     "dividend_yield":0.59,
    #     "beta":          0.85,
    #     "week_52_high":  1_779.00,
    #     "week_52_low":   998.70,
    #     "logo_url":      "https://logo.clearbit.com/airtel.in",
    #     "website_url":   "https://www.airtel.in",
    #     "description":   "Bharti Airtel is a global communications solutions provider with operations in 17+ countries across South Asia and Africa.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "MARUTI",
    #     "company":       "Maruti Suzuki India Limited",
    #     "short":         "Maruti",
    #     "exchange":      "NSE",
    #     "sector":        "Automobile",
    #     "industry":      "Automobiles",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE585B01010",
    #     "current_price": 12_456.80,
    #     "prev_close":    12_328.50,
    #     "open_price":    12_350.00,
    #     "day_high":      12_520.00,
    #     "day_low":       12_290.00,
    #     "volume":        620_000,
    #     "avg_volume":    700_000,
    #     "market_cap":    3_770_000_000_000,
    #     "pe_ratio":      27.8,
    #     "eps":           448.09,
    #     "dividend_yield":1.09,
    #     "beta":          0.74,
    #     "week_52_high":  13_680.00,
    #     "week_52_low":   9_832.00,
    #     "logo_url":      "https://logo.clearbit.com/marutisuzuki.com",
    #     "website_url":   "https://www.marutisuzuki.com",
    #     "description":   "Maruti Suzuki India Limited is India's largest passenger car manufacturer, offering a wide range of vehicles under Maruti and Suzuki brands.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   True,
    # },
    # {
    #     "ticker":        "SUNPHARMA",
    #     "company":       "Sun Pharmaceutical Industries Limited",
    #     "short":         "Sun Pharma",
    #     "exchange":      "BSE",
    #     "sector":        "Healthcare",
    #     "industry":      "Pharmaceuticals",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE044A01036",
    #     "current_price": 1720.55,
    #     "prev_close":    1698.20,
    #     "open_price":    1702.00,
    #     "day_high":      1735.00,
    #     "day_low":       1693.00,
    #     "volume":        3_800_000,
    #     "avg_volume":    4_200_000,
    #     "market_cap":    4_130_000_000_000,
    #     "pe_ratio":      36.5,
    #     "eps":           47.14,
    #     "dividend_yield":0.70,
    #     "beta":          0.58,
    #     "week_52_high":  1_960.00,
    #     "week_52_low":   1_320.00,
    #     "logo_url":      "https://logo.clearbit.com/sunpharma.com",
    #     "website_url":   "https://www.sunpharma.com",
    #     "description":   "Sun Pharmaceutical Industries is India's largest pharmaceutical company and the world's fifth largest specialty generic pharma company.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "LT",
    #     "company":       "Larsen & Toubro Limited",
    #     "short":         "L&T",
    #     "exchange":      "BSE",
    #     "sector":        "Industrials",
    #     "industry":      "Construction & Engineering",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE018A01030",
    #     "current_price": 3578.90,
    #     "prev_close":    3542.60,
    #     "open_price":    3548.00,
    #     "day_high":      3600.00,
    #     "day_low":       3530.00,
    #     "volume":        2_100_000,
    #     "avg_volume":    2_300_000,
    #     "market_cap":    4_960_000_000_000,
    #     "pe_ratio":      34.1,
    #     "eps":           104.97,
    #     "dividend_yield":0.84,
    #     "beta":          1.02,
    #     "week_52_high":  3_905.75,
    #     "week_52_low":   2_876.00,
    #     "logo_url":      "https://logo.clearbit.com/larsentoubro.com",
    #     "website_url":   "https://www.larsentoubro.com",
    #     "description":   "Larsen & Toubro is a major Indian multinational engaged in technology, engineering, construction, manufacturing and financial services.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "ITC",
    #     "company":       "ITC Limited",
    #     "short":         "ITC",
    #     "exchange":      "NSE",
    #     "sector":        "Consumer Staples",
    #     "industry":      "Tobacco & Consumer Goods",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INE154A01025",
    #     "current_price": 428.75,
    #     "prev_close":    424.80,
    #     "open_price":    425.50,
    #     "day_high":      432.00,
    #     "day_low":       421.30,
    #     "volume":        18_000_000,
    #     "avg_volume":    19_500_000,
    #     "market_cap":    5_350_000_000_000,
    #     "pe_ratio":      28.9,
    #     "eps":           14.84,
    #     "dividend_yield":3.49,
    #     "beta":          0.45,
    #     "week_52_high":  528.50,
    #     "week_52_low":   391.00,
    #     "logo_url":      "https://logo.clearbit.com/itcportal.com",
    #     "website_url":   "https://www.itcportal.com",
    #     "description":   "ITC Limited is a multi-business conglomerate with diversified operations in FMCG, hotels, paper, packaging and agribusiness.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # # ── NYSE / NASDAQ (USD) ───────────────────────────────────────────────────
    # {
    #     "ticker":        "AAPL",
    #     "company":       "Apple Inc.",
    #     "short":         "Apple",
    #     "exchange":      "NASDAQ",
    #     "sector":        "Technology",
    #     "industry":      "Consumer Electronics",
    #     "country":       "United States",
    #     "currency":      "USD",
    #     "isin":          "US0378331005",
    #     "current_price": 213.49,
    #     "prev_close":    211.26,
    #     "open_price":    211.50,
    #     "day_high":      214.20,
    #     "day_low":       210.80,
    #     "volume":        52_000_000,
    #     "avg_volume":    55_000_000,
    #     "market_cap":    3_280_000_000_000,
    #     "pe_ratio":      34.8,
    #     "eps":           6.14,
    #     "dividend_yield":0.47,
    #     "beta":          1.24,
    #     "week_52_high":  237.23,
    #     "week_52_low":   164.08,
    #     "logo_url":      "https://logo.clearbit.com/apple.com",
    #     "website_url":   "https://www.apple.com",
    #     "description":   "Apple Inc. designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories worldwide.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   True,
    # },
    # {
    #     "ticker":        "MSFT",
    #     "company":       "Microsoft Corporation",
    #     "short":         "Microsoft",
    #     "exchange":      "NASDAQ",
    #     "sector":        "Technology",
    #     "industry":      "Systems Software",
    #     "country":       "United States",
    #     "currency":      "USD",
    #     "isin":          "US5949181045",
    #     "current_price": 445.82,
    #     "prev_close":    441.25,
    #     "open_price":    442.00,
    #     "day_high":      447.50,
    #     "day_low":       440.30,
    #     "volume":        18_500_000,
    #     "avg_volume":    20_000_000,
    #     "market_cap":    3_310_000_000_000,
    #     "pe_ratio":      37.2,
    #     "eps":           11.98,
    #     "dividend_yield":0.72,
    #     "beta":          0.90,
    #     "week_52_high":  468.35,
    #     "week_52_low":   309.45,
    #     "logo_url":      "https://logo.clearbit.com/microsoft.com",
    #     "website_url":   "https://www.microsoft.com",
    #     "description":   "Microsoft Corporation develops, licenses and supports software, services, devices and solutions worldwide.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   True,
    # },
    # {
    #     "ticker":        "GOOGL",
    #     "company":       "Alphabet Inc.",
    #     "short":         "Google",
    #     "exchange":      "NASDAQ",
    #     "sector":        "Communication Services",
    #     "industry":      "Internet Content & Information",
    #     "country":       "United States",
    #     "currency":      "USD",
    #     "isin":          "US02079K3059",
    #     "current_price": 175.38,
    #     "prev_close":    173.02,
    #     "open_price":    173.50,
    #     "day_high":      176.20,
    #     "day_low":       172.80,
    #     "volume":        24_000_000,
    #     "avg_volume":    26_000_000,
    #     "market_cap":    2_170_000_000_000,
    #     "pe_ratio":      22.1,
    #     "eps":           7.94,
    #     "dividend_yield":0.46,
    #     "beta":          1.05,
    #     "week_52_high":  208.70,
    #     "week_52_low":   130.67,
    #     "logo_url":      "https://logo.clearbit.com/google.com",
    #     "website_url":   "https://www.abc.xyz",
    #     "description":   "Alphabet Inc. is the parent company of Google, which provides internet-related services and products including search, cloud computing and advertising.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # {
    #     "ticker":        "NVDA",
    #     "company":       "NVIDIA Corporation",
    #     "short":         "NVIDIA",
    #     "exchange":      "NASDAQ",
    #     "sector":        "Technology",
    #     "industry":      "Semiconductors",
    #     "country":       "United States",
    #     "currency":      "USD",
    #     "isin":          "US67066G1040",
    #     "current_price": 875.35,
    #     "prev_close":    867.44,
    #     "open_price":    869.00,
    #     "day_high":      882.00,
    #     "day_low":       863.50,
    #     "volume":        38_000_000,
    #     "avg_volume":    41_000_000,
    #     "market_cap":    2_150_000_000_000,
    #     "pe_ratio":      68.4,
    #     "eps":           12.80,
    #     "dividend_yield":0.03,
    #     "beta":          1.68,
    #     "week_52_high":  974.00,
    #     "week_52_low":   394.28,
    #     "logo_url":      "https://logo.clearbit.com/nvidia.com",
    #     "website_url":   "https://www.nvidia.com",
    #     "description":   "NVIDIA Corporation designs, develops and markets graphics processing units (GPUs), system-on-chip units and AI computing platforms.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   True,
    # },
    # {
    #     "ticker":        "TSLA",
    #     "company":       "Tesla, Inc.",
    #     "short":         "Tesla",
    #     "exchange":      "NASDAQ",
    #     "sector":        "Automobile",
    #     "industry":      "Electric Vehicles",
    #     "country":       "United States",
    #     "currency":      "USD",
    #     "isin":          "US88160R1014",
    #     "current_price": 248.42,
    #     "prev_close":    243.16,
    #     "open_price":    244.00,
    #     "day_high":      251.80,
    #     "day_low":       242.50,
    #     "volume":        82_000_000,
    #     "avg_volume":    88_000_000,
    #     "market_cap":    793_000_000_000,
    #     "pe_ratio":      54.6,
    #     "eps":           4.55,
    #     "dividend_yield":0.0,
    #     "beta":          2.31,
    #     "week_52_high":  299.29,
    #     "week_52_low":   138.80,
    #     "logo_url":      "https://logo.clearbit.com/tesla.com",
    #     "website_url":   "https://www.tesla.com",
    #     "description":   "Tesla, Inc. designs, develops, manufactures, leases and sells electric vehicles, energy generation and storage systems.",
    #     "asset_type":    "STOCK",
    #     "is_featured":   False,
    # },
    # # ── ETFs ──────────────────────────────────────────────────────────────────
    # {
    #     "ticker":        "NIFTY50",
    #     "company":       "Nippon India ETF Nifty 50 BeES",
    #     "short":         "Nifty 50 ETF",
    #     "exchange":      "NSE",
    #     "sector":        "Financials",
    #     "industry":      "Index ETF",
    #     "country":       "India",
    #     "currency":      "INR",
    #     "isin":          "INF204K01EP5",
    #     "current_price": 236.85,
    #     "prev_close":    234.92,
    #     "open_price":    235.10,
    #     "day_high":      237.50,
    #     "day_low":       234.20,
    #     "volume":        12_000_000,
    #     "avg_volume":    13_500_000,
    #     "market_cap":    220_000_000_000,
    #     "pe_ratio":      22.5,
    #     "eps":           10.53,
    #     "dividend_yield":1.10,
    #     "beta":          0.98,
    #     "week_52_high":  254.90,
    #     "week_52_low":   192.55,
    #     "logo_url":      "https://logo.clearbit.com/nipponindiaim.com",
    #     "website_url":   "https://www.nipponindiaim.com",
    #     "description":   "Nippon India ETF Nifty 50 BeES tracks the Nifty 50 Index, providing exposure to the top 50 companies listed on NSE.",
    #     "asset_type":    "ETF",
    #     "is_featured":   False,
    # },
]


# ── Seed function ─────────────────────────────────────────────────────────────

def seed_stocks():
    print("\n[seed_stocks] Starting...")
    created = 0
    updated = 0

    for s in STOCKS:
        try:
            existing = Stocks.query.filter_by(ticker_symbol=s["ticker"]).first()

            # Compute derived price fields
            curr  = Decimal(str(s["current_price"]))
            prev  = Decimal(str(s["prev_close"]))
            chg   = curr - prev
            chg_p = (chg / prev * 100) if prev > 0 else Decimal("0")

            if existing:
                # Refresh ONLY static catalog metadata. Never touch price/volume/
                # market-data fields here — those come from the live provider, and
                # overwriting them on every app restart would wipe live data back
                # to hardcoded dummy values (which is exactly what we don't want).
                existing.company_name = s["company"]
                existing.short_name   = s["short"]
                existing.exchange     = s["exchange"]
                existing.sector       = s["sector"]
                existing.industry     = s["industry"]
                existing.country      = s["country"]
                existing.currency     = s["currency"]
                existing.isin         = s.get("isin")
                existing.logo_url     = s.get("logo_url")
                existing.website_url  = s.get("website_url")
                existing.description  = s.get("description")
                existing.asset_type   = s.get("asset_type", "STOCK")
                existing.is_featured  = s.get("is_featured", False)
                existing.is_tradable  = True
                existing.status       = StockStatus.ACTIVE
                db.session.commit()
                updated += 1
                print(f"  [UPDATED metadata] {s['ticker']} ({s['currency']}) — live prices preserved")
            else:
                stock = Stocks()
                stock.ticker_symbol = s["ticker"]
                stock.company_name  = s["company"]
                stock.short_name    = s["short"]
                stock.exchange      = s["exchange"]
                stock.sector        = s["sector"]
                stock.industry      = s["industry"]
                stock.country       = s["country"]
                stock.currency      = s["currency"]
                stock.isin          = s.get("isin")
                # NO dummy trading data — price / change / volume / 52-week stay
                # empty until a live Upstox refresh fills them. Fundamentals
                # (market cap, P/E, EPS, dividend yield, beta) are intentionally
                # NOT seeded: Upstox can't supply them, so we never store them.
                stock.logo_url      = s.get("logo_url")
                stock.website_url   = s.get("website_url")
                stock.description   = s.get("description")
                stock.asset_type    = s.get("asset_type", "STOCK")
                stock.is_featured   = s.get("is_featured", False)
                stock.is_tradable   = True
                stock.status        = StockStatus.ACTIVE
                stock.save()
                created += 1
                print(f"  [CREATED] {s['ticker']} ({s['currency']})")

                # Create matching analytics record
                existing_analytics = StockAnalytics.query.filter_by(stock_id=stock.stock_id).first()
                if not existing_analytics:
                    analytics = StockAnalytics()
                    analytics.stock_id          = stock.stock_id
                    analytics.total_holders     = 0
                    analytics.total_watchers    = 0
                    analytics.popularity_rank   = 999
                    analytics.consensus_rating  = "HOLD"
                    analytics.save()

        except Exception as e:
            db.session.rollback()
            print(f"  [ERROR] {s['ticker']}: {e}")
            traceback.print_exc()

    print(f"\n[seed_stocks] Done — {created} created, {updated} updated.")
    return created + updated


if __name__ == "__main__":
    from portal import create_app
    app = create_app()
    with app.app_context():
        seed_stocks()