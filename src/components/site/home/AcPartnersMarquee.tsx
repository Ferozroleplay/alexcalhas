import { useMemo, useState } from "react";

import type { HomePartner } from "@/data/home-config";

type Props = {
  partners: HomePartner[];
};

/** Repete o conjunto único até preencher a tela; duas metades idênticas para o loop infinito. */
function buildMarqueeLoop(partners: HomePartner[]): HomePartner[] {
  if (partners.length <= 1) return partners;

  const targetPerHalf = 16;
  const reps = Math.max(2, Math.ceil(targetPerHalf / partners.length));
  const half = Array.from({ length: reps }, () => partners).flat();
  return [...half, ...half];
}

function PartnerItem({ partner }: { partner: HomePartner }) {
  const [imgOk, setImgOk] = useState(Boolean(partner.logo));

  const content =
    partner.logo && imgOk ? (
      <img
        src={partner.logo}
        alt={partner.name}
        className="ac-partners__logo"
        loading="lazy"
        decoding="async"
        onError={() => setImgOk(false)}
      />
    ) : (
      <span className="ac-partners__name">{partner.name}</span>
    );

  if (partner.url) {
    return (
      <a
        href={partner.url}
        className="ac-partners__item"
        target="_blank"
        rel="noopener noreferrer"
        title={partner.name}
      >
        {content}
      </a>
    );
  }

  return (
    <div className="ac-partners__item" title={partner.name}>
      {content}
    </div>
  );
}

export function AcPartnersMarquee({ partners }: Props) {
  const single = partners.length === 1;
  const loop = useMemo(
    () => (partners.length === 0 ? [] : single ? partners : buildMarqueeLoop(partners)),
    [partners, single],
  );
  const scrollDuration = single ? 0 : Math.max(28, Math.round(loop.length * 2.2));

  if (partners.length === 0) return null;

  return (
    <section
      className={`ac-partners${single ? " ac-partners--single" : ""}`}
      aria-labelledby="ac-partners-title"
    >
      <div className="ac-container ac-partners__head">
        <h2 id="ac-partners-title" className="ac-partners__title">
          Nossos parceiros
        </h2>
      </div>
      <div className="ac-partners__viewport" aria-hidden="false">
        <div
          className="ac-partners__track"
          style={
            single
              ? undefined
              : ({ "--ac-partners-duration": `${scrollDuration}s` } as React.CSSProperties)
          }
        >
          {loop.map((partner, i) => (
            <PartnerItem
              key={single ? partner.name : `${partner.name}-${partner.logo ?? ""}-${i}`}
              partner={partner}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
