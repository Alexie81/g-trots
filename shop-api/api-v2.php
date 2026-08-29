<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Bucharest');

// Endpointul stabil folosit de website si de ambele aplicatii.
// Logica ramane intr-un singur fisier, ca sa nu existe doua versiuni ale API-ului.
require __DIR__ . '/api.php';
