# G-Trots

Repository-ul central pentru ecosistemul G-Trots: aplicația mobilă, aplicația desktop și website-ul public.

## Structură

- `app/`, `components/`, `contexts/`, `services/` — aplicația mobilă Expo / React Native
- `electron-app/` — aplicația desktop Electron pentru Windows
- `website/` — website-ul static G-Trots
- `server/` — API-ul PHP și schema backend

Aplicațiile includ alegerea modulului `SERVICE` sau `SHOP`. Modulul SHOP va gestiona produse, stoc, comenzi și facturi.

## Pornire locală

Aplicația mobilă:

```powershell
npm install
npm run dev
```

Aplicația desktop:

```powershell
cd electron-app
npm install
npm start
```

## Actualizări desktop

Electron verifică versiunile publicate în GitHub Releases pentru `Alexie81/g-trots`, descarcă actualizarea în fundal și afișează progresul în stânga jos. După descărcare, utilizatorul apasă mesajul de finalizare, iar aplicația se închide și pornește din nou cu versiunea nouă.

Pentru o versiune nouă:

1. Se actualizează `version` în `electron-app/package.json` și `electron-app/package-lock.json`.
2. Se face commit și se publică un tag, de exemplu `v1.2.34`.
3. GitHub Actions construiește instalatorul și creează automat GitHub Release cu fișierele necesare updater-ului.

## Configurație privată

Fișierele `.env`, `server/api_config.local.php`, parolele, instalatoarele și build-urile locale sunt excluse din Git. Pentru server se pornește de la `server/api_config.example.php`.
