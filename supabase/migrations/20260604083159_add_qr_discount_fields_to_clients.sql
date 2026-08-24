/*
  # G-Trots - Adaugare campuri QR si reducere clienti

  ## Modificari

  ### Tabela `clients`
    - `discount_percentage` (numeric, default 0) - procentul de reducere per client (0-100)
    - `qr_used` (boolean, default false) - daca codul QR a fost scanat/utilizat
    - `qr_used_at` (timestamptz, nullable) - data si ora la care a fost utilizat codul QR

  ## Note
  - discount_percentage poate fi 0 (nicio reducere) pana la 100
  - qr_used se seteaza automat pe true cand un agent scaneaza codul QR al clientului
  - qr_used_at inregistreaza momentul utilizarii
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'discount_percentage'
  ) THEN
    ALTER TABLE clients ADD COLUMN discount_percentage numeric NOT NULL DEFAULT 0
      CHECK (discount_percentage >= 0 AND discount_percentage <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'qr_used'
  ) THEN
    ALTER TABLE clients ADD COLUMN qr_used boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'qr_used_at'
  ) THEN
    ALTER TABLE clients ADD COLUMN qr_used_at timestamptz;
  END IF;
END $$;

-- Index pentru cautare rapida dupa qr_code (pentru scanner)
CREATE INDEX IF NOT EXISTS idx_clients_qr_code ON clients(qr_code);
