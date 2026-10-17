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

## Android și iOS

Aplicația mobilă folosește aceeași bază de cod Expo / React Native pentru Android și iOS.

Build-uri de producție pentru ambele platforme:

```powershell
npm run build:mobile
```

Build separat, când este necesar:

```powershell
npm run build:android
npm run build:ios
```

Actualizările care modifică doar codul JavaScript și resursele aplicației se publică simultan pe Android și iOS:

```powershell
npm run update:mobile -- --message "Descriere actualizare"
```

Schimbările care adaugă sau modifică module native necesită build-uri noi pentru ambele platforme. APK-ul Android rămâne publicat prin serverul G-Trots și actualizatorul existent. Build-ul iOS se distribuie exclusiv prin Apple/TestFlight și nu se încarcă pe serverul G-Trots.

### Instalare gratuită pe iPhone

Varianta PWA se generează separat și nu modifică buildul Android:

```powershell
npm run build:pwa
```

Conținutul `dist/` se publică în `/g-trots.ro/aplicatie`, iar pe iPhone aplicația se instalează din Safari prin **Partajare → Adăugați la ecranul principal**. Adresa publică este `https://g-trots.ro/aplicatie/`.

Fiecare build PWA primește automat o amprentă nouă. După publicare, aplicațiile deja instalate detectează noua versiune prin service worker, înlocuiesc cache-ul vechi și se reîncarcă fără reinstalare. Acest flux este separat de EAS Update și de APK-ul Android.

Pentru o actualizare PWA completă (build și publicare):

```powershell
npm run update:pwa
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
