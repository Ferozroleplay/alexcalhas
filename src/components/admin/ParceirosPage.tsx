import { useCallback, useEffect, useState } from "react";

import { PartnerEditModal, type PartnerEditState } from "@/components/admin/parceiros/PartnerEditModal";
import { PartnerForm } from "@/components/admin/parceiros/PartnerForm";
import { PartnerHeader } from "@/components/admin/parceiros/PartnerHeader";
import { PartnersGrid } from "@/components/admin/parceiros/PartnersGrid";
import { formatarWhatsappInput } from "@/components/admin/parceiros/format-whatsapp";
import {
  criarParceiro,
  enviarLogoParceiro,
  excluirParceiro,
  fetchParceiros,
  salvarParceiro,
  type ParceiroItem,
} from "@/lib/parceiros-client";
import { dashConfirm } from "@/lib/dash-ui";

export function ParceirosPage() {
  const [itens, setItens] = useState<ParceiroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logoNovo, setLogoNovo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<PartnerEditState | null>(null);
  const [editLogo, setEditLogo] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      setItens(await fetchParceiros());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar parceiros.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) return;
    setSalvando(true);
    setMsg("");
    setErro("");
    try {
      const item = await criarParceiro({
        nome: nomeTrim,
        whatsapp: whatsapp.trim() || undefined,
      });
      if (logoNovo) {
        await enviarLogoParceiro(item.id, logoNovo);
      }
      setNome("");
      setWhatsapp("");
      setLogoNovo(null);
      setMsg("Parceiro cadastrado com sucesso!");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(p: ParceiroItem) {
    const wa = p.whatsapp_formatado || p.whatsapp?.replace(/^55/, "") || "";
    setEdit({
      id: p.id,
      nome: p.nome,
      whatsapp: wa ? formatarWhatsappInput(wa) : "",
      ativo: p.ativo,
      logo_url: p.logo_url,
    });
    setEditLogo(null);
    setEditOpen(true);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setEditSaving(true);
    setErro("");
    try {
      await salvarParceiro(edit.id, {
        nome: edit.nome.trim(),
        whatsapp: edit.whatsapp.trim() || undefined,
        ativo: edit.ativo,
      });
      if (editLogo) {
        await enviarLogoParceiro(edit.id, editLogo);
      }
      setEditOpen(false);
      setMsg("Parceiro atualizado com sucesso!");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deletar(id: number) {
    if (
      !(await dashConfirm({
        title: "Excluir parceiro?",
        message: "O logo será removido e o parceiro deixará de aparecer na home.",
        confirmText: "Excluir",
        variant: "danger",
      }))
    ) {
      return;
    }
    setErro("");
    try {
      await excluirParceiro(id);
      setMsg("Parceiro excluído.");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="parceiros-page dashboard-page dashboard-page--parceiros">
      <div className="parceiros-page__inner">
        <PartnerHeader />

        {msg ? (
          <div className="parceiros-alert parceiros-alert--success" role="status">
            <i className="bi bi-check-circle-fill" aria-hidden="true" />
            {msg}
          </div>
        ) : null}
        {erro ? (
          <div className="parceiros-alert parceiros-alert--danger" role="alert">
            <i className="bi bi-exclamation-circle-fill" aria-hidden="true" />
            {erro}
          </div>
        ) : null}

        <PartnerForm
          nome={nome}
          whatsapp={whatsapp}
          logoFile={logoNovo}
          salvando={salvando}
          onNomeChange={setNome}
          onWhatsappChange={setWhatsapp}
          onLogoChange={setLogoNovo}
          onSubmit={(e) => void cadastrar(e)}
        />

        <PartnersGrid
          itens={itens}
          loading={loading}
          onEdit={abrirEdicao}
          onDelete={(id) => void deletar(id)}
        />
      </div>

      <PartnerEditModal
        open={editOpen}
        edit={edit}
        editLogo={editLogo}
        saving={editSaving}
        onClose={() => setEditOpen(false)}
        onChange={(patch) => setEdit((prev) => (prev ? { ...prev, ...patch } : prev))}
        onLogoChange={setEditLogo}
        onSubmit={(e) => void salvarEdicao(e)}
      />
    </div>
  );
}
