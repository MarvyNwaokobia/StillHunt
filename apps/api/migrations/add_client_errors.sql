-- Client crashes, reported by the browser that hit them.
--
-- The route error boundary rendered "Something broke" and kept everything else to
-- itself. Diagnosing a crash then meant reasoning backwards from a screenshot,
-- on a phone with no console attached — which produced two confident wrong
-- answers before this table existed.
--
-- Deliberately not a metrics table. It is a small, queryable record of the last
-- N crashes with enough context to name the line that threw: message, stack,
-- route, and which wallet was signed in when it happened.
CREATE TABLE IF NOT EXISTS client_errors (
    id          BIGSERIAL PRIMARY KEY,
    -- Nullable: a crash before auth resolves is exactly the kind we most need.
    wallet_address TEXT,
    message     TEXT NOT NULL,
    stack       TEXT,
    -- Next's error digest, when it supplies one.
    digest      TEXT,
    url         TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only two reads this table gets: newest first, and "is this the same crash
-- as the other twelve".
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_message ON client_errors (message, created_at DESC);
