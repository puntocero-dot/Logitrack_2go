-- Add branch column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch VARCHAR(50) DEFAULT 'central';

-- Update existing orders to have central branch
UPDATE orders SET branch = 'central' WHERE branch IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch);
