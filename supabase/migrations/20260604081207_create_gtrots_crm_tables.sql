/*
  # G-Trots CRM - Schema Initial

  ## Tabele noi

  1. `profiles`
     - `id` (uuid, primary key)
     - `name` (text) - numele profilului (ex: Florin)
     - `role` (text) - functia/rolul
     - `percentage` (numeric) - procentul de afiliere (0-100)
     - `color` (text) - culoare UI pentru identificare
     - `created_at` (timestamptz)

  2. `clients`
     - `id` (uuid, primary key)
     - `name` (text) - numele clientului
     - `phone` (text) - numarul de telefon
     - `email` (text, nullable) - email optional
     - `status` (text) - stare: 'interesat' | 'va_folosi_codul' | 'cod_folosit'
     - `qr_code` (text) - codul QR
     - `price` (numeric) - pretul
     - `profile_id` (uuid, FK -> profiles) - profilul de afiliere
     - `created_at` (timestamptz)

  3. `app_users`
     - `id` (uuid, primary key)
     - `name` (text) - numele utilizatorului aplicatiei
     - `role` (text) - functia in firma
     - `is_active` (boolean) - utilizator activ
     - `created_at` (timestamptz)

  ## Securitate
  - RLS activat pe toate tabelele
  - Acces public pentru operatii CRUD (app interna fara auth)
*/

-- Tabela profiles (profiluri de afiliere)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  percentage numeric NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  color text NOT NULL DEFAULT '#FF6B00',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on profiles"
  ON profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on profiles"
  ON profiles FOR DELETE
  USING (true);

-- Tabela clients (clienti CRM)
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'interesat' CHECK (status IN ('interesat', 'va_folosi_codul', 'cod_folosit')),
  qr_code text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on clients"
  ON clients FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on clients"
  ON clients FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on clients"
  ON clients FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on clients"
  ON clients FOR DELETE
  USING (true);

-- Tabela app_users (utilizatorii aplicatiei)
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on app_users"
  ON app_users FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on app_users"
  ON app_users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on app_users"
  ON app_users FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on app_users"
  ON app_users FOR DELETE
  USING (true);

-- Index-uri pentru performanta
CREATE INDEX IF NOT EXISTS idx_clients_profile_id ON clients(profile_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);

-- Date initiale - profil demo
INSERT INTO profiles (name, role, percentage, color)
VALUES ('Florin', 'Agent Vanzari', 30, '#FF6B00')
ON CONFLICT DO NOTHING;
