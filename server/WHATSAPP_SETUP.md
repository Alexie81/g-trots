# Trimitere automata WhatsApp

Aplicatia Electron trimite direct imaginea QR cu sigla G-Trots si textul asociat prin WhatsApp Business Cloud API.

Pe server trebuie configurate urmatoarele variabile de mediu:

```text
WHATSAPP_PHONE_NUMBER_ID=ID-ul numarului din Meta WhatsApp Manager
WHATSAPP_ACCESS_TOKEN=token permanent Meta
WHATSAPP_GRAPH_VERSION=v23.0
```

Primele doua valori sunt obligatorii. Tokenul trebuie pastrat doar pe server, niciodata in aplicatia Electron.

Serverul PHP trebuie sa aiba activa extensia `cURL`. Dupa configurare, incarca pe server versiunea noua a fisierului `api.php`.

WhatsApp permite mesaje libere cu imagine si text in fereastra de conversatie activa de 24 de ore. In afara acestei ferestre poate fi necesar un template aprobat de Meta.
