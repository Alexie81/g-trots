# Staging SEO catalog Boomag

Acest director este zona locală de pregătire a fișelor SEO. La cererea proprietarului, fișele validate pot fi publicate incremental în baza online.

Reguli:

- toate cele 1.627 de produse trebuie să aibă câte o fișă validă;
- fiecare fișă păstrează produsul exact, sursele cercetării, conținutul, specificațiile, FAQ-urile, compatibilitățile și textele alternative;
- nicio fișă invalidă nu se trimite către `saveBoomagSeoProduct`;
- `scripts/validate-seo-staging.py --verify-feed` compară ID-urile, SKU-urile și EAN-urile pregătite cu feedul Boomag curent;
- `scripts/publish-seo-staging.py` publică numai versiunile validate și modificate, verifică produsul public și memorează local versiunea trimisă;
- publicarea se face în loturi controlate, cu reluare și sincronizare Stripe numai după salvarea reușită.

Fișierele locale rămân sursa auditabilă a conținutului cercetat chiar și după publicare.
