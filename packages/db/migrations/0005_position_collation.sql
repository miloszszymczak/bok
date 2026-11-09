-- Fractional ordering keys are base-62 strings compared byte-wise; locale collations
-- (e.g. en_US: "k" < "V") would scramble the order.
ALTER TABLE "readlist_items" ALTER COLUMN "position" TYPE text COLLATE "C";
