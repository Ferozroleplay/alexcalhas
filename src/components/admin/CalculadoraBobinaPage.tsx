import { DashPageHero } from "@/components/admin/DashPageHero";
import { CalculadoraBobinaWidget } from "@/components/admin/CalculadoraBobinaWidget";

export function CalculadoraBobinaPage() {
  return (
    <div className="analytics-page dash-form-page--pro dash-bobina-page">
      <DashPageHero
        title="Calculadora de bobina"
        subtitle="Informe a bobina, preencha os cortes e veja custo, venda de material e serviço instalado."
        iconClass="bi-calculator"
        accent="materiais"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        <CalculadoraBobinaWidget variant="page" />
      </div>
    </div>
  );
}
