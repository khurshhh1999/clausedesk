-- Local development schema for the embedded PGlite database. Production uses `npm run db:push`.

CREATE TABLE IF NOT EXISTS contracts (
  id text PRIMARY KEY,
  name text NOT NULL,
  sample_id text,
  status text NOT NULL DEFAULT 'parsed',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paragraphs (
  id text NOT NULL,
  contract_id text NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  page integer NOT NULL,
  text text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS paragraph_identity ON paragraphs (contract_id, id);

CREATE TABLE IF NOT EXISTS extractions (
  id text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contracts(id),
  fields jsonb NOT NULL,
  edits jsonb NOT NULL DEFAULT '{}',
  lookup jsonb NOT NULL DEFAULT '[]',
  mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS extraction_contract ON extractions (contract_id);

CREATE TABLE IF NOT EXISTS flags (
  id text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contracts(id),
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contracts(id),
  action text NOT NULL,
  reason text NOT NULL,
  role text NOT NULL,
  snapshot jsonb NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_vendors (
  id text PRIMARY KEY,
  name text NOT NULL,
  approval_id text REFERENCES reviews(id),
  idempotency_key text,
  snapshot jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_approval ON erp_vendors (approval_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_idempotency ON erp_vendors (idempotency_key);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  contract_id text,
  role text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
