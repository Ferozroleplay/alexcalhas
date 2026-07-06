import { DashPageHero } from "@/components/admin/DashPageHero";

export function PartnerHeader() {
  return (
    <DashPageHero
      title="Parceiros"
      subtitle="Gerencie logos e WhatsApp exibidos na página inicial. O visitante clica no logo e abre a conversa com o parceiro."
      iconClass="bi-building"
      accent="parceiros"
      showNovaVisita={false}
      headerMeta={
        <span className="parceiros-header__badge">
          <i className="bi bi-globe2" aria-hidden="true" />
          Site público
        </span>
      }
      cta={
        <a href="/" target="_blank" rel="noopener noreferrer" className="parceiros-header__cta">
          <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
          <span>Ver site</span>
        </a>
      }
    />
  );
}
