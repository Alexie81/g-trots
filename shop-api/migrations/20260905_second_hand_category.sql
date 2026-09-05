ALTER TABLE shop_categories
    ADD COLUMN IF NOT EXISTS system_key VARCHAR(80) NULL AFTER parent_id,
    ADD COLUMN IF NOT EXISTS is_protected TINYINT(1) NOT NULL DEFAULT 0 AFTER system_key;

-- Categoria este identificată în cod prin system_key, nu prin numele sau slugul
-- editabile. Inserarea folosește un UUID fix pentru instalările noi; migrarea
-- automată din api.php adoptă și o categorie veche cu același scop, fără să rupă
-- legăturile produselor existente.
INSERT IGNORE INTO shop_categories
    (id, parent_id, system_key, is_protected, name, slug, description, thumbnail_path, is_active)
VALUES
    ('8f1ac397-76ab-4bd9-9f60-1cd239cf2573', NULL, 'second_hand_scooters', 1,
     'Trotinete second-hand', 'trotinete-second-hand',
     'Trotinete electrice second-hand verificate in service si reconditionate pentru revanzare.',
     NULL, 1);
