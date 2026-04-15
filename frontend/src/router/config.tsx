import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import CoachSummaryPage from "../pages/coachSummary/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/coach-summary",
    element: <CoachSummaryPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
