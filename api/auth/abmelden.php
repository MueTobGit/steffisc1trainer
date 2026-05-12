<?php
/**
 * POST /api/auth/abmelden.php
 *
 * Logout: Aktuelles Token deaktivieren.
 *
 * Header: Authorization: Bearer <token>
 * Response: { erfolg: true, nachricht: "..." }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';

// Nur POST erlaubt
methode_erzwingen('POST');

// Benutzer authentifizieren
$benutzer = benutzer_authentifizieren();

// Token deaktivieren
$pdo = db_verbindung();
$stmt = $pdo->prepare("UPDATE api_tokens SET aktiv = FALSE WHERE id = ?");
$stmt->execute([$benutzer['token_id']]);

json_erfolg(null, 'Erfolgreich abgemeldet.');
