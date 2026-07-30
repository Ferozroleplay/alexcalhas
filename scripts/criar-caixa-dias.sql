-- Status aberto/fechado do caixa por dia (compartilhado entre todos os admins)
CREATE TABLE IF NOT EXISTS caixa_dias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  aberto_por_id INT NULL,
  fechado_por_id INT NULL,
  aberto_em DATETIME NULL,
  fechado_em DATETIME NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_caixa_dias_data (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
