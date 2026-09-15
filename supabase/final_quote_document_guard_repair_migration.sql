-- Repair the versioned-final-document guard after production drift introduced
-- a misspelled EXCLUDED column reference. The trigger remains security-invoker.

CREATE OR REPLACE FUNCTION public.protect_final_quote_document()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  is_versioned_revision BOOLEAN;
BEGIN
  IF OLD.final_quote_document IS NOT NULL AND (
    NEW.final_quote_document IS DISTINCT FROM OLD.final_quote_document OR
    NEW.final_quote_document_version IS DISTINCT FROM OLD.final_quote_document_version OR
    NEW.final_quote_reviewed_at IS DISTINCT FROM OLD.final_quote_reviewed_at OR
    NEW.final_quote_reviewed_by IS DISTINCT FROM OLD.final_quote_reviewed_by
  ) THEN
    is_versioned_revision :=
      NEW.final_quote_document IS NOT NULL AND
      NEW.final_quote_document_version = OLD.final_quote_document_version + 1 AND
      COALESCE((NEW.final_quote_document->>'version')::INTEGER, 0) = NEW.final_quote_document_version AND
      NEW.final_quote_document->>'variant' = 'final' AND
      NEW.final_quote_document->'firmQuoteDraft'->>'status' = 'reviewed' AND
      NEW.firm_quote_workflow->>'status' = 'reviewed' AND
      NEW.final_quote_reviewed_at IS NOT NULL AND
      NEW.final_quote_reviewed_by IS NOT NULL AND
      NEW.final_quote_sent_at IS NULL AND
      NEW.final_quote_sent_by IS NULL AND
      NEW.final_quote_sent_to IS NULL AND
      NEW.final_quote_sent_variant IS NULL;

    IF NOT is_versioned_revision THEN
      RAISE EXCEPTION 'reviewed final quote document is immutable';
    END IF;

    INSERT INTO public.quote_final_document_versions (
      quote_ref, document_version, document, reviewed_at, reviewed_by,
      sent_at, sent_by, sent_to, sent_variant, superseded_at, superseded_by
    ) VALUES (
      OLD.quote_ref, OLD.final_quote_document_version, OLD.final_quote_document,
      OLD.final_quote_reviewed_at, OLD.final_quote_reviewed_by,
      OLD.final_quote_sent_at, OLD.final_quote_sent_by, OLD.final_quote_sent_to,
      OLD.final_quote_sent_variant, NEW.final_quote_reviewed_at, NEW.final_quote_reviewed_by
    )
    ON CONFLICT (quote_ref, document_version) DO UPDATE SET
      document = EXCLUDED.document,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_by = EXCLUDED.reviewed_by,
      sent_at = EXCLUDED.sent_at,
      sent_by = EXCLUDED.sent_by,
      sent_to = EXCLUDED.sent_to,
      sent_variant = EXCLUDED.sent_variant,
      superseded_at = EXCLUDED.superseded_at,
      superseded_by = EXCLUDED.superseded_by;
  END IF;
  RETURN NEW;
END;
$$;
