import { useEffect, useState } from "react";

import type { HomeSlide } from "@/data/home-config";

type Props = {
  slides: HomeSlide[];
};

export function AcHeroSlider({ slides }: Props) {
  const list = slides.slice(0, 6);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (list.length <= 1 || paused) return;
    const id = window.setInterval(() => {
      setCurrent((i) => (i + 1) % list.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [list.length, paused]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (list.length === 0) return null;

  const nextIdx = (current + 1) % list.length;

  return (
    <div
      className="ac-hero__media ac-hero-slider"
      id="ac-hero-slider"
      aria-label="Galeria de trabalhos — Alex Calhas"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {list.map((slide, i) => {
        const active = i === current;
        const preload = i === nextIdx && list.length > 1;
        if (!active && !preload) return null;
        return (
          <div
            key={`${slide.src}-${i}`}
            className={`ac-hero-slider__slide${active ? " is-active" : ""}`}
            aria-hidden={!active}
          >
            <img
              src={slide.src}
              alt={active ? slide.alt : ""}
              width={900}
              height={560}
              fetchPriority={active && i === 0 ? "high" : "low"}
              decoding="async"
              loading={active && i === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          </div>
        );
      })}
      {list.length > 1 ? (
        <>
          <button
            type="button"
            className="ac-hero-slider__arrow ac-hero-slider__arrow--prev"
            aria-label="Imagem anterior"
            onClick={() => setCurrent((i) => (i - 1 + list.length) % list.length)}
          >
            <i className="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ac-hero-slider__arrow ac-hero-slider__arrow--next"
            aria-label="Próxima imagem"
            onClick={() => setCurrent((i) => (i + 1) % list.length)}
          >
            <i className="bi bi-chevron-right" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
