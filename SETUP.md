# Guide de démarrage — COD Dashboard

## 1. Créer le projet Supabase

1. Aller sur https://supabase.com et créer un compte gratuit
2. Créer un **New Project** (ex: `cod-dashboard`)
3. Choisir la région **eu-central-1** (Frankfurt — le plus proche du Maroc)
4. Copier le **Project URL** et **anon public key** depuis Settings > API

## 2. Configurer les variables d'environnement

```bash
# Copier le fichier exemple
cp .env.local.example .env.local
```

Éditer `.env.local` et remplacer les valeurs :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. Créer la base de données

Dans Supabase > **SQL Editor** > **New Query**, coller et exécuter :
- `supabase/schema.sql` (tables + RLS + triggers)
- `supabase/seed.sql` (produits de test, optionnel)

## 4. Créer le compte Admin

1. Dans Supabase > **Authentication** > **Users** > **Invite User**
2. Entrer votre email
3. Vous recevrez un email — définir votre mot de passe
4. Dans **SQL Editor**, exécuter :
```sql
UPDATE public.profiles
SET role = 'admin', full_name = 'Votre Nom'
WHERE email = 'votre@email.com';
```

## 5. Créer les comptes Media Buyers

Option A — Via Supabase Auth:
1. Authentication > Users > Create User
2. Mettre email + password
3. Le profil `media_buyer` est créé automatiquement par le trigger
4. Mettre à jour le taux de commission si besoin:
```sql
UPDATE public.profiles
SET commission_rate = 12  -- 12%
WHERE email = 'buyer@email.com';
```

Option B — Demander au media buyer de s'inscrire si vous activez l'inscription publique.

## 6. Lancer l'application en local

```bash
# S'assurer que Node.js est installé
# Utiliser le Node.js portable installé :
# C:\nodejs\node-v20.18.0-win-x64\npm.cmd install
# C:\nodejs\node-v20.18.0-win-x64\npm.cmd run dev

npm install
npm run dev
```

Ouvrir http://localhost:3000

## 7. Déployer sur Vercel (optionnel)

1. Créer un compte sur https://vercel.com
2. Importer le projet depuis GitHub
3. Ajouter les variables d'environnement dans Vercel > Settings > Environment Variables
4. Deploy !

---

## Structure des coûts par commande

| Champ | Description |
|-------|-------------|
| `selling_price` | Prix de vente au client |
| `product_cost` | Coût d'achat du produit |
| `packaging_cost` | Coût d'emballage |
| `delivery_cost` | Coût de livraison (transporteur) |
| `call_center_cost` | Coût call center par commande |
| `ad_spend` | Dépense publicitaire attribuée |

**Profit net = Prix vente - Coût produit - Packaging - Livraison - Call center - Pub**

**Commission = Profit net × Taux% (seulement si statut = livré)**

---

## Évolutions futures prévues

- [ ] Shopify Webhook → import commandes automatique
- [ ] Facebook Ads API → sync dépenses pub
- [ ] TikTok Ads API
- [ ] Export Excel/CSV
- [ ] Notifications WhatsApp
- [ ] API livraison (Amana, Noest, Maystro)
- [ ] Multi-business (SaaS multi-tenant)
