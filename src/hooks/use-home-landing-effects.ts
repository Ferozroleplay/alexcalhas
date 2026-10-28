import { useEffect } from "react";

import { useAcSiteHeader } from "@/hooks/use-ac-site-header";

/** Menu, header ao rolar e âncoras suaves. Hero e carrossel ficam nos próprios componentes. */
export function useHomeLandingEffects() {
  useAcSiteHeader();

  useEffect(() => {
    const header = document.getElementById("ac-header");

    const onAnchor = (e: Event) => {
      const anchor = e.currentTarget as HTMLAnchorElement;
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top =
        target.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight + 12 : 80);
      window.scrollTo({ top, behavior: "smooth" });
    };

    const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');
    anchors.forEach((a) => a.addEventListener("click", onAnchor));

    return () => {
      anchors.forEach((a) => a.removeEventListener("click", onAnchor));
    };
  }, []);
}
