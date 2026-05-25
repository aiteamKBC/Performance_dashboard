import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import LandingPage from "../pages/landing/page";
import Home from "../pages/home/page";
import CoachSummaryPage from "../pages/coachSummary/page";
import TestKPIsPage from "../pages/testKPIs/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/dashboard",
    element: <Home />,
  },
  {
    path: "/coach-summary",
    element: <CoachSummaryPage />,
  },
  {
    path: "/test-kpis",
    element: <TestKPIsPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
