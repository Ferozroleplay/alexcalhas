import { useMemo, useState } from "react";

import { PartnerCard } from "@/components/admin/parceiros/PartnerCard";
import type { ParceiroItem } from "@/lib/parceiros-client";

type Filter = "all" | "active" | "hidden";

type Props = {
  itens: ParceiroItem[];
  loading: boolean;
  onEdit: (item: ParceiroItem) => void;
  onDelete: (id: number) => void;
};

export function PartnersGrid({ itens, loading, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const ativos = itens.filter((p) => p.ativo).length;
  const filtrados = useMemo(() => {
    if (filter === "active") return itens.filter((p) => p.ativo);
    if (filter === "hidden") return itens.filter((p) => !p.ativo);
    return itens;
  }, [filter, itens]);

  return (
    <section className="parceiros-card parceiros-card--list" aria-labelledby="parceiros-list-title">
      <header className="parceiros-list__header">
        <div>
          <h2 id="parceiros-list-title" className="parceiros-card__title">
            <i className="bi bi-collection" aria-hidden="true" />
            Parceiros cadastrados
          </h2>
          {!loading && itens.length > 0 ? (
            <p className="parceiros-list__meta">
              {ativos} na home · {itens.length} no total
            </p>
          ) : null}
        </div>

        {!loading && itens.length > 0 ? (
          <div className="parceiros-filter" role="tablist" aria-label="Filtrar parceiros">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={`parceiros-filter__btn${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              Todos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "active"}
              className={`parceiros-filter__btn${filter === "active" ? " is-active" : ""}`}
              onClick={() => setFilter("active")}
            >
              Na home
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "hidden"}
              className={`parceiros-filter__btn${filter === "hidden" ? " is-active" : ""}`}
              onClick={() => setFilter("hidden")}
            >
              Ocultos
            </button>
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="parceiros-loading" role="status">
          <span className="parceiros-loading__spinner" aria-hidden="true" />
          Carregando parceiros…
        </div>
      ) : itens.length === 0 ? (
        <div className="parceiros-empty">
          <span className="parceiros-empty__icon" aria-hidden="true">
            <i className="bi bi-building" />
          </span>
          <p className="parceiros-empty__title">Nenhum parceiro cadastrado</p>
          <p className="parceiros-empty__text">Use o formulário acima para adicionar o primeiro logo.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="parceiros-empty parceiros-empty--compact">
          <p className="parceiros-empty__title">Nenhum parceiro neste filtro</p>
          <button type="button" className="parceiros-btn parceiros-btn--ghost" onClick={() => setFilter("all")}>
            Ver todos
          </button>
        </div>
      ) : (
        <div className={`parceiros-grid parceiros-grid--count-${Math.min(filtrados.length, 4)}`}>
          {filtrados.map((p) => (
            <PartnerCard
              key={p.id}
              parceiro={p}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
