/**
 * Every routed page must at least LOAD.
 *
 * `vite build` proves the code parses, not that it runs — a bad import is still
 * valid JavaScript. That gap is what put "Error loading user page" on screen:
 * an import had been appended into a block comment, so the symbol it named was
 * simply undefined and the route died inside its error boundary.
 *
 * Importing the router pulls in every page component, so a missing export, a
 * bad path or a module-level throw fails here instead of in the browser.
 *
 * Run:  npm test
 */

import { describe, it, expect, beforeAll } from "vitest";

/* `createBrowserRouter` reaches for the DOM at module scope. These tests care
   about whether the modules load, not about navigation, so the smallest stub
   that lets the router construct is enough — no jsdom dependency for it. */
beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    const url = new URL("http://localhost/user");
    globalThis.document = { location: url, defaultView: undefined, querySelector: () => null };
    globalThis.window = {
      location: url,
      history: { state: null, pushState() {}, replaceState() {}, go() {} },
      addEventListener() {}, removeEventListener() {},
      document: globalThis.document,
    };
    globalThis.document.defaultView = globalThis.window;
  }
});

describe("route modules", () => {
  // Generous timeout: this import pulls in every page in the app, admin
  // included, and pays the whole transform cost the first time.
  it("the router and every page it references load without throwing", async () => {
    const mod = await import("./routes");
    expect(mod.router).toBeTruthy();
  }, 60_000);

  const pages = [
    ["UserDashboard",   () => import("./pages/user/UserDashboard")],
    ["UserMarket",      () => import("./pages/user/UserMarket")],
    ["UserStockDetail", () => import("./pages/user/UserStockDetail")],
    ["UserPortfolio",   () => import("./pages/user/UserPortfolio")],
    ["UserHoldings",    () => import("./pages/user/UserHoldings")],
    ["UserWatchlist",   () => import("./pages/user/UserWatchlist")],
    ["UserTrade",       () => import("./pages/user/UserTrade")],
    ["UserTransactions",() => import("./pages/user/UserTransactions")],
    ["UserWallet",      () => import("./pages/user/UserWallet")],
    ["UserLayout",      () => import("./pages/user/UserLayout")],
  ];

  it.each(pages)("%s exports a component", async (name, load) => {
    const mod = await load();
    const exported = Object.entries(mod).filter(([, v]) => typeof v === "function");
    expect(exported.length, `${name} exports no component`).toBeGreaterThan(0);
  });

  it("both new pages are actually wired into /user", async () => {
    const { router } = await import("./routes");
    const user  = router.routes.find((r) => r.path === "/user");
    const paths = (user?.children || []).map((c) => c.path);
    expect(paths).toContain("holdings");
    expect(paths).toContain("positions");
  });
});
