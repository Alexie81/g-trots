-- Fisele existente ale clientilor finalizati manual primesc acelasi status.
-- Data deja completata pe fisa este pastrata; altfel folosim momentul
-- finalizarii clientului din jurnal sau ultima lui actualizare.
UPDATE service_sheets ss
JOIN clients c ON c.id = ss.client_id
LEFT JOIN (
  SELECT client_id, MAX(created_at) AS finalized_at
  FROM client_activity_logs
  WHERE action = 'finalized'
  GROUP BY client_id
) cal ON cal.client_id = c.id
SET ss.is_finalized = 1,
    ss.finalized_at = COALESCE(ss.finalized_at, cal.finalized_at, c.updated_at, NOW()),
    ss.service_pdf_filename = NULL,
    ss.service_pdf_share_url = NULL,
    ss.service_pdf_generated_at = NULL
WHERE COALESCE(c.is_finalized, 0) = 1
  AND c.finalization_source = 'manual'
  AND (COALESCE(ss.is_finalized, 0) = 0 OR ss.finalized_at IS NULL);
