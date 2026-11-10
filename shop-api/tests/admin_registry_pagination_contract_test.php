<?php
declare(strict_types=1);

function registryPaginationAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$mobileInvoices = file_get_contents($root . '/components/ShopInvoicesManager.tsx') ?: '';
$mobileNirs = file_get_contents($root . '/components/ShopNirManager.tsx') ?: '';
$desktop = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js') ?: '';

registryPaginationAssert(
    substr_count($mobileInvoices, '<ShopPagination') >= 2 && str_contains($mobileInvoices, 'styles.topPagination'),
    'Facturile mobile/PWA trebuie să aibă paginare deasupra și dedesubtul listei.'
);
registryPaginationAssert(
    str_contains($mobileInvoices, 'invoice.spv_reference')
        && str_contains($mobileInvoices, 'invoice.spv_submission_id')
        && str_contains($mobileInvoices, 'invoice.spv_job?.upload_index')
        && str_contains($mobileInvoices, 'invoice.spv_job?.download_id'),
    'Căutarea facturilor mobile/PWA trebuie să includă toate referințele ANAF disponibile.'
);
registryPaginationAssert(
    substr_count($mobileNirs, '<ShopPagination') >= 2
        && str_contains($mobileNirs, 'page_size: pageSize')
        && str_contains($mobileNirs, 'const [pageSize, setPageSize] = useState(10)'),
    'Registrul NIR mobile/PWA trebuie să folosească paginarea completă sus și jos și dimensiunea selectată.'
);
registryPaginationAssert(
    str_contains($desktop, "pagination('invoices', filtered.length, page.page, page.pageCount, page.pageSize, PAGE_SIZE_OPTIONS, 'top')")
        && str_contains($desktop, "pagination('invoices', filtered.length, page.page, page.pageCount, page.pageSize, PAGE_SIZE_OPTIONS, 'bottom')")
        && str_contains($desktop, 'invoice.spv_reference')
        && str_contains($desktop, 'invoice.spv_job?.upload_index'),
    'Facturile desktop trebuie să aibă paginare sus/jos și căutare după referința ANAF.'
);
registryPaginationAssert(
    str_contains($desktop, "pagination('nirs', registryTotal, registryPage, registryPageCount, registryPageSize, PAGE_SIZE_OPTIONS, 'top')")
        && str_contains($desktop, "pagination('nirs', registryTotal, registryPage, registryPageCount, registryPageSize, PAGE_SIZE_OPTIONS, 'bottom')")
        && str_contains($desktop, "root.querySelectorAll('[data-page-size-key=\"nirs\"]')"),
    'Registrul NIR desktop trebuie să aibă paginare completă sus și jos, inclusiv alegerea dimensiunii paginii.'
);

echo "admin_registry_pagination_contract_test: OK\n";
