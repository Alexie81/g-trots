/*
  # Add price_edit_count to clients

  Tracks how many times price/discount fields have been edited
  after the QR code was used (status = cod_folosit).
  Max allowed edits = 3.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'price_edit_count'
  ) THEN
    ALTER TABLE clients ADD COLUMN price_edit_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;
