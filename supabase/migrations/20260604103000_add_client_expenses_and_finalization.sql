/*
  # Add client expenses and finalization lock

  Adds expense fields used to calculate G-Trots net and a finalization flag
  that locks all edit actions while keeping client details viewable.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'manopera_colaboratori'
  ) THEN
    ALTER TABLE clients ADD COLUMN manopera_colaboratori numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'valoare_piese'
  ) THEN
    ALTER TABLE clients ADD COLUMN valoare_piese numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'is_finalized'
  ) THEN
    ALTER TABLE clients ADD COLUMN is_finalized boolean NOT NULL DEFAULT false;
  END IF;
END $$;
