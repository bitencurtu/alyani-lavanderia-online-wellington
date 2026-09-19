import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refazer a mesma consulta toda vez que o usuário troca de tela
        // e volta poucos segundos depois. Mutations continuam invalidando o
        // que mudou, então dados alterados no próprio sistema atualizam normal.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Carrega o código da próxima rota assim que o usuário demonstra intenção
    // (hover/foco/toque), reduzindo o tempo entre clicar e a tela aparecer.
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
