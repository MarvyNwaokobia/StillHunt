-- Align price_g and g_earned_lifetime with rust_decimal::Decimal (expects NUMERIC, not FLOAT8)
ALTER TABLE items   ALTER COLUMN price_g           TYPE NUMERIC(20,8) USING price_g::NUMERIC;
ALTER TABLE players ALTER COLUMN g_earned_lifetime TYPE NUMERIC(20,8) USING g_earned_lifetime::NUMERIC;
