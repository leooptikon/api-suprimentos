import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api, ApiError, definirAoNaoAutenticado, type Usuario } from "../lib/api";
import { Login } from "../pages/Login";

interface Auth {
  usuario: Usuario;
  admin: boolean;
  sair: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

async function buscarUsuario(): Promise<Usuario | null> {
  try {
    return await api.eu();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // Troca de usuário: descarta os dados do anterior sem desligar a consulta de "eu"
  const trocarUsuario = (u: Usuario | null) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "eu" });
    qc.setQueryData(["eu"], u);
  };
  const eu = useQuery({ queryKey: ["eu"], queryFn: buscarUsuario, retry: false, staleTime: Infinity });

  useEffect(() => {
    definirAoNaoAutenticado(() => qc.setQueryData(["eu"], null));
  }, [qc]);

  if (eu.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-label="Carregando" />
      </div>
    );
  }

  if (eu.isError) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-medium">Não foi possível falar com o servidor.</p>
          <p className="mt-1 text-sm text-muted">Verifique se a API está rodando e tente novamente.</p>
          <button onClick={() => eu.refetch()} className="mt-4 text-sm text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (!eu.data) {
    return (
      <Login
        aoEntrar={trocarUsuario}
      />
    );
  }

  const valor: Auth = {
    usuario: eu.data,
    admin: eu.data.papel === "admin",
    sair: async () => {
      await api.logout().catch(() => undefined);
      trocarUsuario(null);
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
