interface AnimatedPageProps {
  children: React.ReactNode;
}

export function AnimatedPage({ children }: AnimatedPageProps) {
  // A animação antiga esperava 50 ms e depois fazia um fade/slide de 500 ms.
  // Isso dava sensação de atraso em Dashboard e Rolls a cada navegação.
  // Mantemos o wrapper para não precisar alterar as páginas que já o usam,
  // mas renderizamos o conteúdo imediatamente.
  return <div>{children}</div>;
}
