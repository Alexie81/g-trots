/*
  # Add collaborators and per-client labor costs

  Collaborators are the main G-Trots labor expenses. Each client can store
  a separate cost per collaborator, while clients.manopera_colaboratori
  remains the total for compatibility with existing stats.
*/

CREATE TABLE IF NOT EXISTS collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#14B8A6',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on collaborators"
  ON collaborators FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on collaborators"
  ON collaborators FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on collaborators"
  ON collaborators FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on collaborators"
  ON collaborators FOR DELETE
  USING (true);

CREATE TABLE IF NOT EXISTS client_collaborator_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  collaborator_id uuid REFERENCES collaborators(id) ON DELETE SET NULL,
  collaborator_name text NOT NULL,
  collaborator_color text NOT NULL DEFAULT '#14B8A6',
  cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_collaborator_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on client_collaborator_costs"
  ON client_collaborator_costs FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on client_collaborator_costs"
  ON client_collaborator_costs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on client_collaborator_costs"
  ON client_collaborator_costs FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on client_collaborator_costs"
  ON client_collaborator_costs FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_client_collaborator_costs_client_id
  ON client_collaborator_costs(client_id);

CREATE INDEX IF NOT EXISTS idx_client_collaborator_costs_collaborator_id
  ON client_collaborator_costs(collaborator_id);
