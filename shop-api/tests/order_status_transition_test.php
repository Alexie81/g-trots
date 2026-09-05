<?php
declare(strict_types=1);

require_once __DIR__ . '/../order-return.php';

function assertOrderTransition(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

assertOrderTransition(gtrotsCanChangeOrderStatus('shipped', 'completed'), 'Avansarea normală trebuie permisă.');
assertOrderTransition(gtrotsCanChangeOrderStatus('shipped', 'return_confirmed'), 'Saltul înainte către un status de retur trebuie păstrat.');
assertOrderTransition(!gtrotsCanChangeOrderStatus('shipped', 'processing'), 'Statusurile normale nu trebuie mutate înapoi.');
assertOrderTransition(gtrotsCanChangeOrderStatus('return_requested', 'return_refused'), 'Returul solicitat trebuie să poată fi refuzat.');
assertOrderTransition(gtrotsCanChangeOrderStatus('return_refused', 'return_requested'), 'Înainte de confirmare, returul refuzat trebuie să poată fi redeschis.');
assertOrderTransition(gtrotsCanChangeOrderStatus('return_refused', 'return_confirmed'), 'Returul refuzat trebuie să poată fi confirmat ulterior.');
assertOrderTransition(!gtrotsCanChangeOrderStatus('return_confirmed', 'return_requested'), 'După confirmare nu se poate reveni la Retur solicitat.');
assertOrderTransition(!gtrotsCanChangeOrderStatus('return_confirmed', 'return_refused'), 'După confirmare nu se poate reveni la Retur refuzat.');
assertOrderTransition(gtrotsCanChangeOrderStatus('return_confirmed', 'refunded'), 'După confirmare trebuie permisă rambursarea.');
assertOrderTransition(!gtrotsCanChangeOrderStatus('refunded', 'return_confirmed'), 'Rambursarea este terminală.');
assertOrderTransition(gtrotsCanChangeOrderStatus('completed', 'cancelled'), 'Anularea manuală după livrare trebuie păstrată.');

echo "order_status_transition_test: OK\n";
