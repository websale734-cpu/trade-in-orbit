-- Fix: the balance check was one function shared by the postings and
-- journal_entries triggers, but it read NEW."entry_id", a column only postings
-- has, so it failed when fired for journal_entries. Split it into a shared
-- assertion plus one small trigger function per table.

DROP TRIGGER "postings_balanced" ON "postings";
DROP TRIGGER "journal_entries_have_postings" ON "journal_entries";
DROP FUNCTION check_entry_balanced();

CREATE FUNCTION assert_entry_balanced(entry text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM "postings" WHERE "entry_id" = entry) < 2 THEN
    RAISE EXCEPTION 'journal entry % needs at least two postings', entry;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "postings" WHERE "entry_id" = entry
    GROUP BY "asset_code" HAVING sum("amount") <> 0
  ) THEN
    RAISE EXCEPTION 'journal entry % is unbalanced', entry;
  END IF;
END $$;

CREATE FUNCTION check_posting_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_entry_balanced(NEW."entry_id");
  RETURN NULL;
END $$;

CREATE FUNCTION check_journal_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_entry_balanced(NEW."id");
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "postings_balanced" AFTER INSERT ON "postings"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_posting_entry_balanced();
CREATE CONSTRAINT TRIGGER "journal_entries_have_postings" AFTER INSERT ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_entry_balanced();