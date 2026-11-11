<?php
declare(strict_types=1);

/** Local, deterministic semantic matching; no external API or customer data transfer. */
final class GtrotsFixedAssetSearch
{
    // Only equivalent terms, not broad categories (e.g. a laptop is not any computer).
    private const GROUPS = [
        ['laptop', 'laptopuri', 'notebook', 'notebooks'],
        ['calculator', 'calculatoare', 'computer', 'computers', 'pc', 'desktop', 'workstation'],
        ['telefon', 'telefoane', 'smartphone', 'smartphones'],
        ['imprimanta', 'imprimante', 'printer', 'printers'],
        ['scanner', 'scannere', 'scaner', 'scanere'],
        ['monitor', 'monitoare'],
        ['tastatura', 'tastaturi', 'keyboard'],
        ['acumulator', 'acumulatoare', 'baterie', 'baterii'],
        ['incarcator', 'incarcatoare', 'charger'],
        ['bormasina', 'bormasini'],
        ['polizor', 'polizoare', 'flex'],
        ['surubelnita', 'surubelnite'],
        ['compresor', 'compresoare'],
        ['elevator', 'elevatoare'],
        ['raft', 'rafturi'],
        ['scaun', 'scaune'],
        ['dulap', 'dulapuri'],
        ['diagnostic', 'diagnoza', 'diagnosticare'],
        ['factura', 'facturi'], ['bon', 'bonuri'], ['pv'],
    ];
    private const PHRASES = [
        'statie de lucru' => 'workstation', 'statii de lucru' => 'workstation',
        'telefon mobil' => 'telefon', 'telefoane mobile' => 'telefoane',
        'masina de gaurit' => 'bormasina', 'masini de gaurit' => 'bormasini',
        'proces verbal' => 'pv', 'procese verbale' => 'pv',
    ];
    private const STOP_WORDS = ['de', 'din', 'la', 'pentru', 'cu', 'si', 'in', 'pe', 'al', 'ale', 'ai', 'a', 'un', 'o', 'sau'];

    public static function normalize(string $value): string
    {
        $value = strtr($value, ['ă'=>'a','â'=>'a','î'=>'i','ș'=>'s','ş'=>'s','ț'=>'t','ţ'=>'t',
            'Ă'=>'a','Â'=>'a','Î'=>'i','Ș'=>'s','Ş'=>'s','Ț'=>'t','Ţ'=>'t']);
        $value = mb_strtolower($value, 'UTF-8');
        // Keep word boundaries; SQL wildcard characters are ordinary separators.
        return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value) ?? '');
    }

    private static function words(string $value): array
    {
        foreach (self::PHRASES as $phrase => $replacement) {
            $value = preg_replace('/(?<!\S)' . preg_quote($phrase, '/') . '(?!\S)/u', $replacement, $value) ?? $value;
        }
        return array_values(array_unique(array_filter(explode(' ', $value),
            static fn(string $word): bool => $word !== '' && !in_array($word, self::STOP_WORDS, true))));
    }

    private static function concept(string $word): string
    {
        static $concepts = null;
        if ($concepts === null) {
            $concepts = [];
            foreach (self::GROUPS as $group) foreach ($group as $term) $concepts[$term] = $group[0];
        }
        return $concepts[$word] ?? $word;
    }

    public static function query(string $value): array
    {
        $normalized = self::normalize(mb_substr(trim($value), 0, 160));
        $words = self::words($normalized);
        // In A-001 / DE 001 the word before the number is a series, not a filler.
        preg_match_all('/(?:^| )([a-z]+) (?=[0-9])/u', $normalized, $references);
        foreach ($references[1] as $series) if (in_array($series, self::STOP_WORDS, true)) $words[] = $series;
        return ['text' => $normalized, 'compact' => str_replace(' ', '', $normalized), 'words' => array_values(array_unique($words))];
    }

    private static function typo(string $query, string $word): bool
    {
        // Never approximate numbers, models, short terms or document identifiers.
        if (!preg_match('/^[a-z]{5,}$/D', $query) || !preg_match('/^[a-z]{5,}$/D', $word) || $query[0] !== $word[0]) return false;
        $limit = min(strlen($query), strlen($word)) >= 9 ? 2 : 1;
        if (abs(strlen($query) - strlen($word)) > $limit) return false;
        if (levenshtein($query, $word) <= $limit) return true;
        // One adjacent transposition is a single typing error, even on shorter words.
        if (strlen($query) !== strlen($word)) return false;
        $different = [];
        for ($i = 0; $i < strlen($query); $i++) if ($query[$i] !== $word[$i]) $different[] = $i;
        return count($different) === 2 && $different[1] === $different[0] + 1
            && $query[$different[0]] === $word[$different[1]] && $query[$different[1]] === $word[$different[0]];
    }

    /** Zero excludes a row. Score bands keep exact results ahead of semantic and fuzzy matches. */
    public static function score(array $row, array $query): int
    {
        if ($query['text'] === '') return 0;
        $name = self::normalize((string)($row['product_name'] ?? ''));
        $series = self::normalize((string)($row['series'] ?? ''));
        $number = self::normalize((string)($row['document_number'] ?? ''));
        $document = trim($series . ' ' . $number);
        $identifiers = array_values(array_filter([$series, $number, $document], static fn(string $s): bool => $s !== ''));
        $compactIdentifiers = array_map(static fn(string $s): string => str_replace(' ', '', $s), $identifiers);
        if (in_array($query['compact'], $compactIdentifiers, true)) return 60000;
        if ($name === $query['text']) return 50000;
        if (!$query['words']) return 0;

        $nameWords = self::words($name);
        $identifierWords = array_values(array_unique(array_merge(
            explode(' ', $document), $compactIdentifiers
        )));
        $typeWords = self::words(self::normalize((string)($row['document_type'] ?? '')));
        $worst = 4; $quality = 0; $typos = 0;
        foreach ($query['words'] as $term) {
            // Document words are exact only, including alphabetic series.
            $best = in_array($term, $identifierWords, true) ? 4 : 0;
            $hasDigit = (bool)preg_match('/\p{N}/u', $term);
            foreach ($nameWords as $word) {
                if ($term === $word) { $best = 4; break; }
                if ($hasDigit || preg_match('/\p{N}/u', $word)) continue;
                if (self::concept($term) === self::concept($word)) $best = max($best, 2);
                // Prefixes support typing a word in progress; never substring matches.
                elseif (mb_strlen($term) >= 3 && str_starts_with($word, $term)) $best = max($best, 3);
                elseif ($best < 1 && self::typo($term, $word)) $best = 1;
            }
            foreach ($typeWords as $word) {
                if ($term === $word) $best = max($best, 4);
                elseif (!$hasDigit && self::concept($term) === self::concept($word)) $best = max($best, 2);
            }
            if ($best === 0 || ($best === 1 && ++$typos > 1)) return 0;
            $worst = min($worst, $best);
            $quality += $best;
        }
        $phrase = str_contains(' ' . $name . ' ', ' ' . $query['text'] . ' ') ? 500 : 0;
        return $worst * 10000 + $quality * 10 + $phrase;
    }
}
