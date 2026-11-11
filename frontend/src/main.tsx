import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AcoesProvider } from "./components/acoes";
import { AuthProvider } from "./components/auth";
import { Layout } from "./components/Layout";
import "./index.css";
import { Compras } from "./pages/Compras";
import { Dashboard } from "./pages/Dashboard";
import { Fornecedores } from "./pages/Fornecedores";
import { Movimentacoes } from "./pages/Movimentacoes";
import { Pessoas } from "./pages/Pessoas";
import { ProdutoDetalhe } from "./pages/ProdutoDetalhe";
import { ProprioDetalhePagina, Proprios } from "./pages/Proprios";
import { Produtos } from "./pages/Produtos";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AcoesProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="produtos" element={<Produtos />} />
                <Route path="produtos/:id" element={<ProdutoDetalhe />} />
                <Route path="proprios" element={<Proprios />} />
                <Route path="proprios/:id" element={<ProprioDetalhePagina />} />
                <Route path="compras" element={<Compras />} />
                <Route path="movimentacoes" element={<Movimentacoes />} />
                <Route path="fornecedores" element={<Fornecedores />} />
                <Route path="pessoas" element={<Pessoas />} />
                <Route path="*" element={<Dashboard />} />
              </Route>
            </Routes>
          </AcoesProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" },
          classNames: { description: "!text-[var(--muted)]" },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
