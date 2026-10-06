import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AcAgendarForm } from "@/components/site/home/AcAgendarForm";
import { AcLoginModal } from "@/components/site/home/AcLoginModal";
import { AcPartnersMarquee } from "@/components/site/home/AcPartnersMarquee";
import { AcSiteChat } from "@/components/site/home/AcSiteChat";
import { HOME_SITE, waUrl } from "@/data/home-config";
import { useHomeLandingEffects } from "@/hooks/use-home-landing-effects";
import { fetchAdminSession } from "@/lib/admin-api";
import type { HomeLandingData } from "@/data/home-config";

type Props = {
  data: HomeLandingData;
  painelLoginOpen?: boolean;
  onPainelLoginOpenChange?: (open: boolean) => void;
  loginErro?: string;
};

export function HomeLanding({ data, painelLoginOpen, onPainelLoginOpenChange, loginErro }: Props) {
  const navigate = useNavigate();
  const [localLogin, setLocalLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingPainel, setCheckingPainel] = useState(false);

  const loginOpen = painelLoginOpen ?? localLogin;
  const setLoginOpen = onPainelLoginOpenChange ?? setLocalLogin;

  useHomeLandingEffects();

  useEffect(() => {
    document.body.classList.add("ac-landing");
    document.body.dataset.waNumber = HOME_SITE.whatsapp;
    return () => {
      document.body.classList.remove("ac-landing");
      delete document.body.dataset.waNumber;
    };
  }, []);

  useEffect(() => {
    void fetchAdminSession()
      .then((s) => setLoggedIn(s.authenticated))
      .catch(() => setLoggedIn(false));
  }, []);

  async function abrirPainel() {
    setCheckingPainel(true);
    try {
      const { authenticated } = await fetchAdminSession();
      if (authenticated) {
        window.location.assign("/painel");
        return;
      }
      setLoginOpen(true);
    } catch {
      setLoginOpen(true);
    } finally {
      setCheckingPainel(false);
    }
  }

  function fecharLogin() {
    setLoginOpen(false);
    void navigate({ to: "/", search: {}, replace: true });
  }

  const { servicos, heroSlides, galeria, parceiros } = data;
  const year = new Date().getFullYear();

  return (
    <>
      <header className="ac-header" id="ac-header">
        <div className="ac-container ac-header__inner">
          <a href="#inicio" className="ac-header__logo" aria-label="Alex Calhas — início">
            <img
              src={HOME_SITE.img.logoHeader}
              width={150}
              height={52}
              alt="Alex Calhas"
              className="ac-header__logo-img"
            />
          </a>

          <button
            type="button"
            className="ac-header__toggle"
            id="ac-nav-toggle"
            aria-expanded="false"
            aria-controls="ac-nav"
            aria-label="Abrir menu"
          >
            <span />
            <span />
            <span />
          </button>

          <nav className="ac-header__nav" id="ac-nav" aria-label="Principal">
            <ul className="ac-header__menu">
              <li>
                <a href="#inicio">Início</a>
              </li>
              <li>
                <a href="#servicos">Serviços</a>
              </li>
              <li>
                <a href="#projetos">Projetos</a>
              </li>
              <li>
                <Link to="/galeria">Galeria</Link>
              </li>
              <li>
                <a href="#contato">Contato</a>
              </li>
            </ul>
            {loggedIn ? (
              <a href="/painel" className="ac-header__login">
                Painel
              </a>
            ) : (
              <button
                type="button"
                className="ac-header__login ac-header__login--btn"
                id="ac-open-login"
                aria-haspopup="dialog"
                disabled={checkingPainel}
                onClick={() => void abrirPainel()}
              >
                {checkingPainel ? "…" : "Login"}
              </button>
            )}
          </nav>

          <a href="#contato" className="ac-btn ac-btn--primary ac-header__cta">
            <i className="bi bi-calendar-check" aria-hidden="true" /> Agendar visita
          </a>
        </div>
      </header>

      <main>
        <section className="ac-hero" id="inicio">
          <div className="ac-hero__decor" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="ac-container ac-hero__grid">
            <div className="ac-hero__content">
              <span className="ac-kicker">Qualidade que protege</span>
              <h1 className="ac-hero__title">
                Calhas, rufos e pingadeiras com{" "}
                <span className="ac-hero__title-accent">instalação profissional</span>
              </h1>
              <p className="ac-hero__desc">
                Soluções sob medida para proteger sua obra com eficiência, durabilidade e um acabamento
                impecável.
              </p>
              <div className="ac-hero__actions">
                <a href="#contato" className="ac-btn ac-btn--primary ac-btn--lg">
                  <i className="bi bi-calendar-check" aria-hidden="true" /> Agendar visita
                </a>
                <a href="#servicos" className="ac-btn ac-btn--outline ac-btn--lg">
                  Ver serviços
                </a>
              </div>
              <p className="ac-hero__trust">
                <i className="bi bi-shield-check" aria-hidden="true" />
                Atendimento rápido e garantia de qualidade
              </p>
            </div>
            <div className="ac-hero__media ac-hero-slider" id="ac-hero-slider" aria-label="Galeria de trabalhos — Alex Calhas">
              {heroSlides.map((slide, i) => (
                <div key={`${slide.src}-${i}`} className={`ac-hero-slider__slide${i === 0 ? " is-active" : ""}`} data-slide={i}>
                  <img
                    src={slide.src}
                    alt={slide.alt}
                    width={900}
                    height={560}
                    fetchPriority={i === 0 ? "high" : undefined}
                    loading={i === 0 ? undefined : "lazy"}
                  />
                </div>
              ))}
              {heroSlides.length > 1 ? (
                <>
                  <button type="button" className="ac-hero-slider__arrow ac-hero-slider__arrow--prev" id="ac-hero-prev" aria-label="Imagem anterior">
                    <i className="bi bi-chevron-left" aria-hidden="true" />
                  </button>
                  <button type="button" className="ac-hero-slider__arrow ac-hero-slider__arrow--next" id="ac-hero-next" aria-label="Próxima imagem">
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="ac-benefits" aria-label="Diferenciais">
          <div className="ac-container ac-benefits__inner">
            <article className="ac-benefit">
              <div className="ac-benefit__icon">
                <i className="bi bi-rulers" aria-hidden="true" />
              </div>
              <h3>Sob medida</h3>
              <p>Peças fabricadas conforme a necessidade do seu projeto.</p>
            </article>
            <article className="ac-benefit">
              <div className="ac-benefit__icon">
                <i className="bi bi-lightning-charge" aria-hidden="true" />
              </div>
              <h3>Atendimento rápido</h3>
              <p>Respostas ágeis e prazos que cabem na sua obra.</p>
            </article>
            <article className="ac-benefit">
              <div className="ac-benefit__icon">
                <i className="bi bi-award" aria-hidden="true" />
              </div>
              <h3>Instalação especializada</h3>
              <p>Equipe qualificada e acabamento profissional.</p>
            </article>
            <article className="ac-benefit">
              <div className="ac-benefit__icon">
                <i className="bi bi-geo-alt" aria-hidden="true" />
              </div>
              <h3>Atendimento regional</h3>
              <p>Atendemos toda a região com eficiência e dedicação.</p>
            </article>
          </div>
        </section>

        <AcPartnersMarquee partners={parceiros} />

        <section className="ac-section ac-section--soft" id="servicos">
          <div className="ac-container">
            <header className="ac-section__head">
              <span className="ac-kicker">Nossos serviços</span>
              <h2 className="ac-section__title">Soluções completas para seu projeto</h2>
            </header>
            <div className="ac-services__grid">
              {servicos.map((s) => (
                <article key={s.slug} className="ac-service-card">
                  <a href={`#contato`} className="ac-service-card__img">
                    <img src={s.img} alt={`${s.titulo} — Alex Calhas`} loading="lazy" width={400} height={180} />
                  </a>
                  <div className="ac-service-card__body">
                    <h3>{s.titulo}</h3>
                    <p>{s.texto}</p>
                    <a href="#contato" className="ac-service-card__arrow" aria-label={`Ver galeria de ${s.titulo}`}>
                      <i className="bi bi-arrow-right" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ac-section ac-section--dark" id="projetos">
          <div className="ac-container">
            <header className="ac-section__head">
              <span className="ac-kicker">Trabalhos realizados</span>
              <h2 className="ac-section__title">Qualidade que você vê, resultado que você sente</h2>
            </header>
            <div className="ac-portfolio-carousel" id="ac-portfolio-carousel" aria-label="Galeria de trabalhos realizados">
              <div className="ac-portfolio-carousel__viewport">
                <div className="ac-portfolio-carousel__track">
                  {galeria.map((item, i) => (
                    <figure key={`${item.src}-${i}`} className="ac-portfolio-carousel__item">
                      <img src={item.src} alt={item.legenda} loading="lazy" width={280} height={210} />
                      <figcaption>{item.legenda}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
            <p className="ac-portfolio__cta">
              <Link to="/galeria" className="ac-btn ac-btn--outline">
                Ver galeria completa
              </Link>
            </p>
          </div>
        </section>

        <section className="ac-section ac-section--canvas" id="sobre">
          <div className="ac-container ac-why__grid">
            <header className="ac-section__head ac-section__head--left">
              <span className="ac-kicker">Por que escolher a Alex Calhas?</span>
              <h2 className="ac-section__title">Compromisso com qualidade do início ao fim</h2>
            </header>
            <div className="ac-why__list">
              <article className="ac-why__item">
                <div className="ac-why__icon">
                  <i className="bi bi-gem" aria-hidden="true" />
                </div>
                <div>
                  <h3>Materiais de qualidade</h3>
                  <p>Utilizamos materiais duráveis e resistentes.</p>
                </div>
              </article>
              <article className="ac-why__item">
                <div className="ac-why__icon">
                  <i className="bi bi-people" aria-hidden="true" />
                </div>
                <div>
                  <h3>Mão de obra especializada</h3>
                  <p>Profissionais experientes e comprometidos.</p>
                </div>
              </article>
              <article className="ac-why__item">
                <div className="ac-why__icon">
                  <i className="bi bi-stars" aria-hidden="true" />
                </div>
                <div>
                  <h3>Acabamento impecável</h3>
                  <p>Detalhes que valorizam seu projeto.</p>
                </div>
              </article>
              <article className="ac-why__item">
                <div className="ac-why__icon">
                  <i className="bi bi-hand-thumbs-up" aria-hidden="true" />
                </div>
                <div>
                  <h3>Confiança no atendimento</h3>
                  <p>Atenção e cuidado em cada etapa do serviço.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="ac-section ac-section--soft ac-section--agendar" id="contato">
          <div className="ac-container">
            <div className="ac-contact__form-card">
              <AcAgendarForm />
            </div>
          </div>
        </section>

        <section className="ac-contact-band" aria-label="Contato e localização">
          <div className="ac-container ac-contact-band__inner">
            <div className="ac-contact__info">
              <h2>Fale com a Alex Calhas</h2>
              <p>Solicite seu orçamento sem compromisso.</p>
              <ul className="ac-contact__list">
                <li>
                  <i className="bi bi-whatsapp" aria-hidden="true" />
                  <a href={waUrl(HOME_SITE.whatsapp)} target="_blank" rel="noopener noreferrer">
                    {HOME_SITE.telefone1}
                  </a>
                </li>
                <li>
                  <i className="bi bi-telephone" aria-hidden="true" />
                  <a href={waUrl(HOME_SITE.whatsappSec)} target="_blank" rel="noopener noreferrer">
                    {HOME_SITE.telefone2}
                  </a>
                </li>
                <li>
                  <i className="bi bi-envelope" aria-hidden="true" />
                  <a href={`mailto:${HOME_SITE.email}`}>{HOME_SITE.email}</a>
                </li>
                <li>
                  <i className="bi bi-geo-alt" aria-hidden="true" />
                  <span>{HOME_SITE.endereco}</span>
                </li>
              </ul>
            </div>
            <div className="ac-contact__map">
              <iframe
                src={HOME_SITE.mapsEmbed}
                title="Localização Alex Calhas, Rua Angelim 137, Tarumã SP"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="ac-footer">
        <div className="ac-container ac-footer__grid">
          <div className="ac-footer__brand">
            <img className="ac-footer__logo" src={HOME_SITE.img.logoFooter} width={160} height={56} alt="Alex Calhas" />
            <p>Soluções em calhas, rufos e acabamentos com qualidade e confiança.</p>
          </div>
          <div>
            <h3 className="ac-footer__title">Navegação</h3>
            <ul className="ac-footer__links">
              <li>
                <a href="#inicio">Início</a>
              </li>
              <li>
                <a href="#servicos">Serviços</a>
              </li>
              <li>
                <a href="#projetos">Projetos</a>
              </li>
              <li>
                <Link to="/galeria">Galeria</Link>
              </li>
              <li>
                <a href="#contato">Contato</a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="ac-footer__title">Contato</h3>
            <ul className="ac-footer__contact">
              <li>
                <a href={waUrl(HOME_SITE.whatsapp)} target="_blank" rel="noopener noreferrer">
                  {HOME_SITE.telefone1}
                </a>
              </li>
              <li>
                <a href={waUrl(HOME_SITE.whatsappSec)} target="_blank" rel="noopener noreferrer">
                  {HOME_SITE.telefone2}
                </a>
              </li>
              <li>
                <a href={`mailto:${HOME_SITE.email}`}>{HOME_SITE.email}</a>
              </li>
              <li>{HOME_SITE.endereco}</li>
            </ul>
          </div>
        </div>
        <div className="ac-footer__bottom">
          <div className="ac-container ac-footer__bottom-inner">
            <p>
              &copy; {year} Alex Calhas. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      <AcSiteChat />
      {!loggedIn ? <AcLoginModal open={loginOpen} onClose={fecharLogin} erro={loginErro} /> : null}
    </>
  );
}
