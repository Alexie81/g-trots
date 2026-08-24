# G-Trots Desktop Updates

Continutul folderului `updates/windows` trebuie publicat la:

`https://g-trots.ro/download-app/updates/windows/`

Pentru fiecare versiune noua:

1. Creste versiunea din `electron-app/package.json`.
2. Ruleaza build-ul Windows.
3. Urca installerul `.exe`, fisierul `.exe.blockmap` si `latest.yml`.
4. Suprascrie `latest.yml`; pastreaza versiunile vechi ale installerelor daca doresti rollback/manual download.
5. Verifica in browser ca `latest.yml` este accesibil fara autentificare si fara redirect catre HTML.

Arhiva `g-trots-setup-win64.zip` ramane separata si este folosita de pagina publica de download.
