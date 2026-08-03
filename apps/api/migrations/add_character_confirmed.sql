-- Confirm-your-class (post-Railway-loss).
-- Players rebuilt from on-chain events may have the wrong class vs what they
-- actually chose (the real choice was in the lost Railway DB). So a reconstructed
-- player must CONFIRM (keep or re-pick) their class + set a username on next login.
-- Players created normally through onboarding are confirmed at creation.
-- Existing (reconstructed) rows default to FALSE → they'll be prompted.
ALTER TABLE players ADD COLUMN IF NOT EXISTS character_confirmed BOOLEAN NOT NULL DEFAULT false;
