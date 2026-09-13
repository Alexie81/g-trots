<?php
declare(strict_types=1);

function normalizedSearchText(mixed $value): string {
    $text = trim((string)$value);
    if ($text === '') return '';
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) $text = $converted;
    }
    $text = strtolower($text);
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? '';
    return trim(preg_replace('/\s+/', ' ', $text) ?? '');
}

function normalizedProductIdentifier(mixed $value): string {
    $text = trim((string)$value);
    if ($text === '') return '';
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) $text = $converted;
    }
    return strtoupper(preg_replace('/[^a-z0-9]+/i', '', $text) ?? '');
}

function productIdentifierValues(array $row): array {
    return array_values(array_filter(array_unique(array_map(
        'normalizedProductIdentifier',
        [$row['sku'] ?? '', $row['supplier_product_code'] ?? '', $row['ean'] ?? '']
    )), static fn(string $value): bool => $value !== ''));
}

function productSemanticSearchScore(array $row, string $query): float {
    $normalizedQuery = normalizedSearchText($query);
    if ($normalizedQuery === '') return 1.0;
    $tokens = array_values(array_unique(array_filter(explode(' ', $normalizedQuery), static fn(string $token): bool => strlen($token) >= 2)));
    if (!$tokens) return 0.0;
    $synonyms = [
        'controler' => ['controller'], 'controller' => ['controler'],
        'incarcator' => ['charger', 'alimentator'], 'charger' => ['incarcator', 'alimentator'],
        'anvelopa' => ['cauciuc', 'pneu'], 'cauciuc' => ['anvelopa', 'pneu'], 'pneu' => ['anvelopa', 'cauciuc'],
        'display' => ['ecran', 'bord'], 'ecran' => ['display', 'bord'], 'bord' => ['display', 'ecran'],
        'baterie' => ['acumulator'], 'acumulator' => ['baterie'],
        'frana' => ['frane', 'placute'], 'frane' => ['frana', 'placute'], 'placute' => ['frana', 'frane'],
        'furca' => ['suspensie', 'amortizor'], 'suspensie' => ['furca', 'amortizor'],
        'trotineta' => ['scuter'], 'scuter' => ['trotineta'],
        'lumina' => ['far', 'stop', 'lampa'], 'far' => ['lumina', 'lampa'],
    ];
    // SKU, EAN si codul furnizorului sunt identificatori, nu text liber. Pe
    // aceste campuri permitem doar potriviri reale, niciodata distanta
    // Levenshtein (de exemplu CMM087 nu trebuie sa potriveasca CMM086).
    $fields = [
        [normalizedSearchText($row['name'] ?? ''), 6.0, true],
        [normalizedSearchText($row['sku'] ?? ''), 7.0, false],
        [normalizedSearchText($row['supplier_product_code'] ?? ''), 7.0, false],
        [normalizedSearchText($row['ean'] ?? ''), 7.0, false],
        [normalizedSearchText($row['category_name'] ?? ''), 3.4, true],
        [normalizedSearchText($row['manufacturer_name'] ?? ''), 4.0, true],
        [normalizedSearchText($row['search_brand_names'] ?? ''), 4.5, true],
        [normalizedSearchText($row['search_short_description'] ?? ''), 1.8, true],
        [normalizedSearchText($row['search_description_title'] ?? ''), 2.2, true],
        [normalizedSearchText($row['source_domain'] ?? ''), 1.2, true],
    ];
    $score = 0.0;
    $matchedTokens = 0;
    foreach ($tokens as $token) {
        $alternatives = array_values(array_unique([$token, ...($synonyms[$token] ?? [])]));
        $tokenBest = 0.0;
        foreach ($fields as [$field, $weight, $allowsTypoTolerance]) {
            if ($field === '') continue;
            $fieldWords = explode(' ', $field);
            foreach ($alternatives as $alternative) {
                if ($field === $alternative) $tokenBest = max($tokenBest, 24.0 * $weight);
                elseif (in_array($alternative, $fieldWords, true)) $tokenBest = max($tokenBest, 15.0 * $weight);
                elseif (str_contains($field, $alternative)) $tokenBest = max($tokenBest, 10.0 * $weight);
                elseif ($allowsTypoTolerance && strlen($alternative) >= 4) {
                    foreach ($fieldWords as $word) {
                        if (abs(strlen($word) - strlen($alternative)) > 2) continue;
                        $distance = levenshtein($alternative, $word);
                        $allowed = max(1, min(3, (int)floor(strlen($alternative) * 0.32)));
                        if ($distance <= $allowed) $tokenBest = max($tokenBest, (8.5 - ($distance * 1.7)) * $weight);
                    }
                }
            }
        }
        if ($tokenBest > 0) {
            $matchedTokens++;
            $score += $tokenBest;
        } else {
            $score -= 12.0;
        }
    }
    // Cautarile cu mai multe cuvinte trebuie sa pastreze majoritatea clara a
    // intentiei. Pragul anterior de 55% lasa sa treaca rezultate prea generale.
    $minimumMatches = max(1, (int)ceil(count($tokens) * 0.70));
    if ($matchedTokens < $minimumMatches) return 0.0;
    $name = normalizedSearchText($row['name'] ?? '');
    if ($name === $normalizedQuery) $score += 220.0;
    elseif (str_contains($name, $normalizedQuery)) $score += 110.0;
    elseif (str_starts_with($name, $tokens[0])) $score += 35.0;
    return $score;
}

function productManagerSearchRows(array $rows, string $query): array {
    $identifierQuery = normalizedProductIdentifier($query);
    if ($identifierQuery !== '') {
        $exact = array_values(array_filter($rows, static function (array $row) use ($identifierQuery): bool {
            return in_array($identifierQuery, productIdentifierValues($row), true);
        }));
        if ($exact) {
            foreach ($exact as &$row) $row['_search_score'] = 1000000.0;
            unset($row);
            usort($exact, static fn(array $left, array $right): int => strcasecmp((string)($left['name'] ?? ''), (string)($right['name'] ?? '')));
            return $exact;
        }
    }

    $scored = [];
    foreach ($rows as $row) {
        $score = productSemanticSearchScore($row, $query);
        if ($score <= 0) continue;
        $row['_search_score'] = $score;
        $scored[] = $row;
    }
    usort($scored, static function (array $left, array $right): int {
        $scoreOrder = ((float)$right['_search_score']) <=> ((float)$left['_search_score']);
        return $scoreOrder !== 0 ? $scoreOrder : strcasecmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });
    return $scored;
}
