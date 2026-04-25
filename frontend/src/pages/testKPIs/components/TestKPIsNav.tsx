import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

export default function TestKPIsNav() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const location = useLocation();

  return (
    <div className="relative overflow-hidden bg-[#0f0f0f] text-white">
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 48px)"
      }} />
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center">
          <img
            src="https://tutordashboard.kentbusinesscollege.net/assets/Kent-Business-College-COzDF_vQ.webp"
            alt="Kent Business College"
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-6 text-sm text-white/50">
          <Link
            to="/"
            className={`transition-colors whitespace-nowrap cursor-pointer ${location.pathname === "/" ? "text-white/80 font-medium" : "hover:text-white"}`}
          >
            Coaches Lateness
          </Link>
          <Link
            to="/coach-summary"
            className={`transition-colors whitespace-nowrap cursor-pointer ${location.pathname === "/coach-summary" ? "text-white/80 font-medium" : "hover:text-white"}`}
          >
            Coach Summary
          </Link>
          <Link
            to="/test-kpis"
            className={`transition-colors whitespace-nowrap cursor-pointer ${location.pathname === "/test-kpis" ? "text-white/80 font-medium" : "hover:text-white"}`}
          >
            KPIs
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <span className="text-white/40 text-xs hidden sm:inline-block">{dateStr}</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 px-8 py-8">
        <div className="flex items-end justify-between gap-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-white/60 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e8a838] inline-block"></span>
              PR &amp; MCM tracking per case owner
            </div>
            <h1 className="text-4xl font-black tracking-tight leading-none mb-2">
              <span className="text-[#e8a838]">KPIs</span>
            </h1>
            <p className="text-white/40 text-sm mt-3 max-w-xs">
              Progress review and monthly coaching meeting KPIs broken down by case owner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
