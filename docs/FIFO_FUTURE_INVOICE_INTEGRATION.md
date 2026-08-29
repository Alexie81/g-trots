# Integrarea FIFO pentru viitorul modul de facturi emise

Acest document descrie punctul de integrare pregătit; nu există și nu trebuie adăugat acum un endpoint public sau un UI de facturare/consum.

## Contract intern

Serviciul viitor apelează intern `shopNirFifoPreviewForProduct()` pentru simulare și `shopNirConsumeFifo()` numai din tranzacția de confirmare a documentului de ieșire. Parametrii obligatorii pentru consum sunt:

- `productId` (StockItem);
- `warehouseId`;
- cantitate în unitatea de stoc;
- `sourceDocumentType`;
- `sourceDocumentId`;
- `sourceLineId` unic și imuabil;
- `idempotencyKey` stabil pentru retry-ul aceleiași confirmări.

## Flux exact

1. **Validarea stocului.** Înainte de confirmare se citesc loturile deschise pentru StockItem și gestiune. Stocul comercial nu este folosit ca substitut pentru Stocuri Conta/FIFO. Cantitatea negativă nu este permisă implicit.
2. **Preview cost.** Se apelează preview-ul read-only. Acesta sortează după data recepției, confirmare/creare și ID, apoi returnează loturile, cantitatea din fiecare, totalul și lipsa. Nu modifică `remaining_quantity`.
3. **Confirmarea facturii.** Backend-ul pornește o singură tranzacție, blochează factura/linia și verifică statusul, versiunea și cheia de idempotency.
4. **Consumul loturilor.** În aceeași tranzacție se apelează `shopNirConsumeFifo()`. Serviciul blochează loturile eligibile `FOR UPDATE`, repetă verificarea disponibilității și alocă FIFO determinist.
5. **InventoryLayerConsumption.** Pentru fiecare alocare se inserează un rând cu lot, StockItem, gestiune, sursă, linie, cantitate, cost unitar și total. Constrângerile unice pe sursă/linie/lot și idempotency împiedică dublarea.
6. **RemainingQuantity.** Fiecare lot este decrementat condiționat și tranzacțional. Statusul este derivat: open, partially consumed sau consumed. Registrul contabil/mișcarea de ieșire trebuie actualizat în aceeași tranzacție de confirmare a facturii.
7. **Idempotency.** Un retry cu aceeași cheie și aceeași linie returnează alocarea existentă. O cheie reutilizată pentru altă cerere trebuie să producă 409. Nu se reexecută decrementarea.
8. **Reversarea facturii.** Reversarea este un document separat. Blochează consumurile originale, creează trasabilitate de reversare, readaugă exact cantitățile în loturile sursă și creează mișcarea contabilă inversă în aceeași tranzacție. Nu se șterg consumurile istorice.
9. **Imuabilitate.** O factură confirmată nu poate schimba produsul, gestiunea, cantitatea sau costul. Corectarea folosește reversare/document de corecție și o nouă confirmare idempotentă.

## Costul de achiziție folosit la facturare

La emiterea viitoarei facturi, alocările FIFO stabilesc costul real al fiecărei poziții. Dacă întreaga cantitate provine dintr-un singur lot, costul de achiziție unitar este costul acelui lot. Dacă poziția traversează mai multe loturi, se păstrează fiecare alocare separat, iar costul unitar intern al poziției este media ponderată:

`cost unitar intern = suma costurilor FIFO alocate / cantitatea facturată`

Factura păstrează snapshot-ul alocărilor și al costului calculat, astfel încât marja și costul mărfii să poată fi determinate ulterior fără a rescrie istoricul. Costul de achiziție este informație internă și nu se tipărește pe documentul transmis clientului.

## Pseudocod tranzacțional

```text
BEGIN
  lock invoice and outbound lines
  verify status + row_version + idempotency
  for each stock line:
    allocation = shopNirConsumeFifo(
      productId, warehouseId, quantity,
      "CUSTOMER_INVOICE", invoiceId, invoiceLineId, idempotencyKey
    )
    create traced outbound inventory movement using allocation.total_cost_ron
  mark invoice confirmed and immutable
  write audit and outbox
COMMIT
publish outbox after commit
```

Dacă orice linie nu are cantitate suficientă, întreaga tranzacție face rollback. Nu se permit consumuri parțiale accidentale, stoc negativ sau apeluri din renderer/mobil direct către serviciul intern.
