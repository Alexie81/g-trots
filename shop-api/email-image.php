<?php
declare(strict_types=1);

// Outlook pentru Windows nu afișează consecvent imaginile WebP. Acest endpoint
// livrează exclusiv imaginile locale ale produselor în format JPEG, fără să
// accepte URL-uri externe sau căi arbitrare de pe server.
$file = basename(trim((string)($_GET['file'] ?? '')));
if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.webp$/i', $file)) {
    http_response_code(404);
    exit;
}

$productsDirectory = realpath(__DIR__ . '/uploads/products');
$source = $productsDirectory !== false
    ? realpath($productsDirectory . DIRECTORY_SEPARATOR . $file)
    : false;
if ($productsDirectory === false || $source === false || dirname($source) !== $productsDirectory || !is_file($source) || filesize($source) > 15 * 1024 * 1024) {
    http_response_code(404);
    exit;
}

$etag = '"' . hash('sha256', $file . ':' . (string)filesize($source) . ':' . (string)filemtime($source)) . '"';
header('Content-Type: image/jpeg');
header('Content-Disposition: inline; filename="g-trots-product.jpg"');
header('Cache-Control: public, max-age=31536000, immutable');
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

if (function_exists('imagecreatefromwebp') && function_exists('imagejpeg')) {
    $image = @imagecreatefromwebp($source);
    if ($image !== false) {
        $width = imagesx($image);
        $height = imagesy($image);
        $canvas = imagecreatetruecolor($width, $height);
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefill($canvas, 0, 0, $white);
        imagealphablending($canvas, true);
        imagecopy($canvas, $image, 0, 0, 0, 0, $width, $height);
        imagejpeg($canvas, null, 90);
        imagedestroy($canvas);
        imagedestroy($image);
        exit;
    }
}

if (class_exists('Imagick')) {
    try {
        $image = new Imagick($source);
        $image->setImageBackgroundColor('white');
        if (method_exists($image, 'mergeImageLayers')) $image = $image->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
        $image->setImageFormat('jpeg');
        $image->setImageCompressionQuality(90);
        echo $image->getImagesBlob();
        $image->clear();
        $image->destroy();
        exit;
    } catch (Throwable $ignored) {
        // Răspunsul rămâne controlat; nu expunem calea sau eroarea serverului.
    }
}

http_response_code(415);
