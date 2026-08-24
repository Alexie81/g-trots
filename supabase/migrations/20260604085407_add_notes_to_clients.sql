/*
  # G-Trots - Adaugare camp note la clienti

  ## Modificari

  ### Tabela `clients`
    - `notes` (text, nullable) - note/observatii adaugate la utilizarea codului QR
      sau la editarea manuala a clientului
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'notes'
  ) THEN
    ALTER TABLE clients ADD COLUMN notes text;
  END IF;
END $$;
