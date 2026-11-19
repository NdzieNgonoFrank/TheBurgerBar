CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  nom_en TEXT,
  ordre INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS produits (
  id SERIAL PRIMARY KEY,
  categorie_id INT REFERENCES categories(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  nom_en TEXT,
  description TEXT,
  description_en TEXT,
  prix INT NOT NULL CHECK (prix >= 0),          -- FCFA, sans décimales
  image_url TEXT,
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  ordre INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS commandes (
  id SERIAL PRIMARY KEY,
  client_nom TEXT NOT NULL,
  client_tel TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('retrait', 'livraison')),
  adresse TEXT,
  note TEXT,
  frais_livraison INT NOT NULL DEFAULT 0,
  total INT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'recue'
    CHECK (statut IN ('recue', 'en_preparation', 'prete', 'terminee', 'annulee')),
  paiement TEXT NOT NULL DEFAULT 'a_la_reception',
  langue TEXT NOT NULL DEFAULT 'fr',
  cree_le TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_commande (
  id SERIAL PRIMARY KEY,
  commande_id INT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id INT REFERENCES produits(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,                              -- nom au moment de la commande
  quantite INT NOT NULL CHECK (quantite > 0),
  prix_unitaire INT NOT NULL                      -- prix au moment de la commande
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  mot_de_passe_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commandes_cree_le ON commandes (cree_le DESC);

ALTER TABLE produits ADD COLUMN IF NOT EXISTS vedette BOOLEAN NOT NULL DEFAULT FALSE;
