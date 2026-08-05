import { createBrowserRouter } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LandingPage } from "./pages/LandingPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
// Admin
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminUserDetail } from "./pages/admin/AdminUserDetail";
import { AdminAllStocks } from "./pages/admin/AdminAllStocks";
import { AdminStockDetail } from "./pages/admin/AdminStockDetail";
import { AdminAnalytics } from "./pages/admin/AdminAnalytics";
import { AdminNews } from "./pages/admin/AdminNews";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { AdminFinance } from "./pages/admin/AdminFinance";
// User
import { UserLayout } from "./pages/user/UserLayout";
import { UserDashboard } from "./pages/user/UserDashboard";
import { UserMarket } from "./pages/user/UserMarket";
import { UserStockDetail } from "./pages/user/UserStockDetail";
import { UserPortfolio } from "./pages/user/UserPortfolio";
import { UserHoldings, UserPositions } from "./pages/user/UserHoldings";
import { UserWatchlist } from "./pages/user/UserWatchlist";
import { UserTrade } from "./pages/user/UserTrade";
import { UserNews } from "./pages/user/UserNews";
import { UserTransactions } from "./pages/user/UserTransactions";
import { UserWallet } from "./pages/user/UserWallet";
import { UserSettings } from "./pages/user/UserSettings";

const withErrorBoundary = (Component) => {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
};

export const router = createBrowserRouter([
  { path: "/", Component: LandingPage },
  { path: "/signin", Component: SignInPage },
  { path: "/signup", Component: SignUpPage },
  {
    path: "/admin",
    Component: AdminLayout,
    errorElement: <ErrorBoundary><div>Error loading admin page</div></ErrorBoundary>,
    children: [
      { index: true, Component: AdminDashboard },
      { path: "users", Component: AdminUsers },
      { path: "users/:userId", Component: AdminUserDetail },
      { path: "stocks", Component: AdminAllStocks },
      { path: "stock/:symbol", Component: AdminStockDetail },
      { path: "analytics", Component: AdminAnalytics },
      { path: "news", Component: AdminNews },
      { path: "finance", Component: AdminFinance },
      { path: "settings", Component: AdminSettings },
    ],
  },
  {
    path: "/user",
    Component: UserLayout,
    errorElement: <ErrorBoundary><div>Error loading user page</div></ErrorBoundary>,
    children: [
      { index: true, Component: UserDashboard },
      { path: "market", Component: UserMarket },
      { path: "stock/:symbol", Component: UserStockDetail },
      { path: "portfolio", Component: UserPortfolio },
      { path: "holdings",  Component: UserHoldings },
      { path: "positions", Component: UserPositions },
      { path: "watchlist", Component: UserWatchlist },
      { path: "trade", Component: UserTrade },
      { path: "news", Component: UserNews },
      { path: "transactions", Component: UserTransactions },
      { path: "wallet", Component: UserWallet },
      { path: "settings", Component: UserSettings },
    ],
  },
]);


















