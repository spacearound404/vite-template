import { Navigate, Route, Routes } from "react-router-dom";
import DefaultLayout from "@/layouts/default";

import IndexPage from "@/pages/index";
import DocsPage from "@/pages/docs";
import PricingPage from "@/pages/pricing";
import BlogPage from "@/pages/blog";
import AboutPage from "@/pages/about";
import MainPage from "@/pages/main";
import TagsPage from "@/pages/tags";
import DaysPage from "@/pages/days";
import OptPage from "@/pages/opt";

function App() {
  return (
    <DefaultLayout>
      <Routes>
        <Route element={<IndexPage />} path="/" />
        <Route element={<MainPage />} path="/main" />
        <Route element={<TagsPage />} path="/tags" />
        <Route element={<DaysPage />} path="/days" />
        <Route element={<OptPage />} path="/opt" />
        <Route element={<DocsPage />} path="/docs" />
        <Route element={<PricingPage />} path="/pricing" />
        <Route element={<BlogPage />} path="/blog" />
        <Route element={<AboutPage />} path="/about" />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DefaultLayout>
  );
}

export default App;
