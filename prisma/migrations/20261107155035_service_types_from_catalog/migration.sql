-- Nuove tipologie di servizio, allineate al catalogo di matteomarino.eu.
-- (Gli indici trigram della migrazione "constraints" non sono descritti nello schema Prisma:
--  `prisma migrate dev` propone di eliminarli, quelle istruzioni vanno sempre rimosse.)
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'LANDING_PAGE';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'ECOMMERCE';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'MOBILE_APP';
