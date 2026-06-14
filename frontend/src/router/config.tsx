import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import CoachDetailPage from "../pages/home/CoachDetailPage";
import CoachSummaryPage from "../pages/coachSummary/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/dashboard",
    element: <Home />,
  },
  {
    path: "/coach/:id",
    element: <CoachDetailPage />,
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
