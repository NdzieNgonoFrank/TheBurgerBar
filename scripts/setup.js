// Crée les tables et ajoute un menu d'exemple si la base est vide.
// Les noms, descriptions et prix sont provisoires : à remplacer par ceux du restaurant.
const fs = require('fs');
const path = require('path');
const pool = require('../lib/db');

const MENU = [
  ['Burgers', 'Burgers', [
    ['Classic', 'Classic', 'Boeuf haché, cheddar, salade, tomate, oignon, sauce maison.', 'Beef patty, cheddar, lettuce, tomato, onion, house sauce.', 3500],
    ['Double cheese', 'Double cheese', 'Deux steaks, double cheddar fondu, pickles, sauce maison.', 'Two patties, double melted cheddar, pickles, house sauce.', 4500],
    ['Poulet croustillant', 'Crispy chicken', 'Filet de poulet pané, salade croquante, mayonnaise épicée.', 'Breaded chicken fillet, crunchy lettuce, spicy mayo.', 3800],
    ['Smoky BBQ', 'Smoky BBQ', 'Boeuf, oignons caramélisés, cheddar, sauce barbecue fumée.', 'Beef, caramelized onions, cheddar, smoky barbecue sauce.', 4200],
    ['Veggie', 'Veggie', 'Galette de légumes et pois chiches, avocat, tomate, sauce yaourt.', 'Vegetable and chickpea patty, avocado, tomato, yogurt sauce.', 3300],
  ]],
  ['Accompagnements', 'Sides', [
    ['Frites', 'Fries', 'Frites croustillantes, sel fin.', 'Crispy fries, fine salt.', 1000],
    ['Frites cheddar', 'Cheddar fries', 'Frites nappées de sauce cheddar.', 'Fries topped with cheddar sauce.', 1500],
    ["Rondelles d'oignon", 'Onion rings', 'Rondelles d\'oignon panées, sauce au choix.', 'Breaded onion rings, choice of sauce.', 1200],
  ]],
  ['Boissons', 'Drinks', [
    ['Jus de gingembre', 'Ginger juice', 'Fait maison, bien frais.', 'Homemade, served cold.', 1000],
    ['Bissap', 'Hibiscus drink', 'Infusion d\'hibiscus glacée.', 'Iced hibiscus infusion.', 800],
    ['Soda', 'Soda', 'Bouteille 33 cl.', '33 cl bottle.', 700],
    ['Eau minérale', 'Mineral water', 'Bouteille 50 cl.', '50 cl bottle.', 500],
  ]],
  ['Desserts', 'Desserts', [
    ['Brownie chocolat', 'Chocolate brownie', 'Brownie moelleux au chocolat noir.', 'Fudgy dark chocolate brownie.', 1500],
    ['Milkshake vanille', 'Vanilla milkshake', 'Glace vanille mixée avec du lait frais.', 'Vanilla ice cream blended with fresh milk.', 2000],
  ]],
];

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const { rows } = await pool.query('SELECT 1 FROM produits LIMIT 1');
  if (rows.length) {
    console.log('La base contient déjà des produits : menu d\'exemple non ajouté.');
  } else {
    let o = 0;
    for (const [nom, nomEn, produits] of MENU) {
      const { rows: [cat] } = await pool.query(
        'INSERT INTO categories (nom, nom_en, ordre) VALUES ($1,$2,$3) RETURNING id', [nom, nomEn, ++o]);
      let p = 0;
      for (const [n, nEn, d, dEn, prix] of produits) {
        await pool.query(
          `INSERT INTO produits (categorie_id, nom, nom_en, description, description_en, prix, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [cat.id, n, nEn, d, dEn, prix, ++p]);
      }
    }
    await pool.query("UPDATE produits SET vedette = TRUE WHERE nom IN ('Classic', 'Double cheese', 'Smoky BBQ')");
    console.log('Menu d\'exemple ajouté.');
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
