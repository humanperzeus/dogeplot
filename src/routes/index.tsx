import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import TestDashboard from "../pages/test/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/test",
    element: <TestDashboard />,
  },
]);
