# Staging SEO catalog Boomag

Acest director este zona locală de pregătire a fișelor SEO. Fișierele de aici nu se publică individual în baza online.

Reguli:

- toate cele 1.627 de produse trebuie să aibă câte o fișă validă;
- fiecare fișă păstrează produsul exact, sursele cercetării, conținutul, specificațiile, FAQ-urile, compatibilitățile și textele alternative;
- nicio fișă nouă nu se trimite către `saveBoomagSeoProduct` în timpul pregătirii;
- `scripts/validate-seo-staging.py` trebuie să raporteze `publish_allowed: true` înainte de publicarea catalogului;
- publicarea finală se face în loturi controlate, cu reluare, audit după fiecare lot și sincronizare Stripe numai după salvarea reușită.

Produsul Boomag `57746` este pilotul publicat anterior acestei reguli. Restul fișelor rămân în staging până la finalizarea și verificarea întregului catalog.
