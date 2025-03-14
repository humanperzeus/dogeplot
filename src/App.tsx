import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/home";
import TestDashboard from "./pages/test/page";

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/test" element={<TestDashboard />} />
      </Routes>
    </Suspense>
  );
}

export default App;
