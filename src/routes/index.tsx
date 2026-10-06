import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { HomeLanding } from "@/components/site/home/HomeLanding";
import { getHomeLandingData } from "@/lib/home-landing.functions";

type IndexSearch = {
  painel?: "login";
  erro?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    painel: search.painel === "login" ? "login" : undefined,
    erro: typeof search.erro === "string" ? search.erro : undefined,
  }),
  loader: async () => ({
    home: await getHomeLandingData(),
  }),
  head: () => ({
    meta: [
      { title: "Alex Calhas — Calhas, rufos e pingadeiras com instalação profissional" },
      {
        name: "description",
        content:
          "Soluções sob medida em calhas, rufos, pingadeiras, condutores, coifas e caixas térmicas. Atendimento rápido e acabamento impecável.",
      },
      { property: "og:title", content: "Alex Calhas — Qualidade que protege" },
      {
        property: "og:description",
        content: "Calhas, rufos e pingadeiras com instalação profissional.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
      },
      { rel: "stylesheet", href: "/css/home-landing.css" },
      { rel: "stylesheet", href: "/css/home-landing-enhance.css" },
    ],
  }),
  component: Index,
});

function Index() {
  const { home } = Route.useLoaderData();
  const { painel, erro } = Route.useSearch();
  const [loginOpen, setLoginOpen] = useState(painel === "login");

  useEffect(() => {
    if (painel === "login") setLoginOpen(true);
  }, [painel]);

  return (
    <HomeLanding
      data={home}
      painelLoginOpen={loginOpen}
      onPainelLoginOpenChange={setLoginOpen}
      loginErro={erro}
    />
  );
}
