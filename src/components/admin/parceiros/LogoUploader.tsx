import { useEffect, useId, useRef, useState } from "react";

type Props = {
  nome: string;
  logoUrl?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  id?: string;
};

export function LogoUploader({ nome, logoUrl = "", file, onFileChange, id }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displayUrl = preview ?? logoUrl;

  function pickFile(next: File | null) {
    if (!next) return;
    onFileChange(next);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped?.type.startsWith("image/")) pickFile(dropped);
  }

  return (
    <div className="parceiros-uploader">
      <label className="parceiros-field__label" htmlFor={inputId}>
        Logo do parceiro
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="visually-hidden"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          pickFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <div
        className={`parceiros-uploader__zone${dragging ? " is-dragging" : ""}${displayUrl ? " has-preview" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        aria-label="Enviar logo do parceiro"
      >
        {displayUrl ? (
          <img src={displayUrl} alt="" className="parceiros-uploader__preview" />
        ) : (
          <div className="parceiros-uploader__empty">
            <span className="parceiros-uploader__icon" aria-hidden="true">
              <i className="bi bi-cloud-arrow-up" />
            </span>
            <span className="parceiros-uploader__title">Arraste a imagem ou clique para enviar</span>
            <span className="parceiros-uploader__meta">PNG, JPG, WebP ou GIF · até 8 MB</span>
          </div>
        )}
        {displayUrl ? (
          <span className="parceiros-uploader__change">
            <i className="bi bi-arrow-repeat" aria-hidden="true" /> Trocar imagem
          </span>
        ) : null}
      </div>
      <p className="parceiros-uploader__hint">
        {nome.trim()
          ? "Esta logo aparece no carrossel da página inicial."
          : "Prefira fundo transparente para melhor resultado na home."}
      </p>
    </div>
  );
}
