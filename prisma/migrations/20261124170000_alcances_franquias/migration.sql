-- Alcances novos (E16): todas as franquias e só a sua franquia.
ALTER TYPE "AccessScope" ADD VALUE IF NOT EXISTS 'FRANQUIAS';
ALTER TYPE "AccessScope" ADD VALUE IF NOT EXISTS 'FRANQUIA';
