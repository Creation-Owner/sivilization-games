# 🚀 Sivilization Shop - Setup Guide

## Quick Start

### Option 1: Clone to Your Computer

```powershell
# Navigate to Desktop
cd C:\Users\user\OneDrive\Desktop

# Clone the repository
git clone https://github.com/Creation-Owner/sivilization-shop.git

# Go into the folder
cd sivilization-shop

# Install dependencies
npm install

# Start the development server
npm run dev
```

Then open: **http://localhost:5173**

---

### Option 2: Use GitHub Codespaces (No Installation)

1. Go to: https://github.com/Creation-Owner/sivilization-shop
2. Click the green **"Code"** button
3. Click **"Codespaces"** tab
4. Click **"Create codespace on main"**
5. Wait for it to load (about 1-2 minutes)
6. In the terminal, run: `npm run dev`
7. Click the popup to open in browser

---

## 🔑 Supabase Setup (For Login to Work)

1. Go to https://supabase.com and create a free account
2. Create a new project
3. Go to **Project Settings** → **API**
4. Copy your credentials
5. Edit `.env.local` file:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_RKAFWn2klm4Sf7TVSywtSQ_GWKT0oiB
   ```

### Create Database Tables:

Run this SQL in Supabase SQL Editor:

```sql
-- Profiles table
create table profiles (
  id uuid references auth.users not null primary key,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Films table
create table films (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  genre text,
  release_year integer,
  duration text,
  rating numeric default 0,
  video_path text,
  poster_path text,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table films enable row level security;

-- Allow public read access
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

create policy "Public films are viewable by everyone"
  on films for select
  using ( true );

-- Allow authenticated users to insert films
create policy "Authenticated users can insert films"
  on films for insert
  with check ( auth.role() = 'authenticated' );
```

---

## 🎯 Features

✅ User authentication (login/signup)
✅ Shopping cart with localStorage
✅ Media streaming with video player
✅ Games section
✅ Shop with add to cart
✅ Library with progress tracking
✅ Profile management
✅ Admin panel for film upload
✅ Responsive design
✅ Dark theme

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** Supabase
- **Styling:** Custom CSS
- **Deployment:** Ready for Vercel/Netlify

---

## 📱 Test the Website

1. **Create an account** - Click "Create account" on login page
2. **Browse media** - Click films to watch
3. **Shop** - Add products to cart
4. **View cart** - Click cart icon in header
5. **Library** - See your saved content
6. **Profile** - View account settings

---

## 🚀 Deploy to Production

### Vercel:
1. Go to https://vercel.com
2. Import your GitHub repository
3. Add environment variables from `.env.local`
4. Deploy!

### Netlify:
1. Go to https://netlify.com
2. Connect GitHub repository
3. Add environment variables
4. Deploy!

---

## 📞 Support

For issues or questions, create an issue on GitHub or contact the developer.

**Enjoy your Sivilization Shop! 🎉**
