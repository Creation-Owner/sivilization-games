# 🗄️ Database Setup Guide for Admin Dashboard

## Step 1: Create Supabase Tables

Go to your Supabase project → **SQL Editor** and run this:

```sql
-- Create profiles table
create table if not exists profiles (
  id uuid references auth.users not null primary key,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create films table
create table if not exists films (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  genre text,
  release_year integer,
  duration text,
  rating numeric default 0,
  video_url text,
  poster_url text,
  video_path text,
  poster_path text,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table films enable row level security;

-- Create policies
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

create policy "Users can insert their own profile"
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Public films are viewable by everyone"
  on films for select
  using ( true );

create policy "Admins can insert films"
  on films for insert
  with check ( 
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );

create policy "Admins can update films"
  on films for update
  using ( 
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );

create policy "Admins can delete films"
  on films for delete
  using ( 
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );
```

---

## Step 2: Create Storage Bucket for Films

1. Go to **Storage** in Supabase
2. Click **"New bucket"**
3. Name it: `films`
4. Set **Public bucket** = ✅ (checked)
5. Click **"Create bucket"**

### Set Storage Policies:

Go to the `films` bucket → **Policies** → **New Policy**

**Policy 1: Allow public read access**
```sql
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'films');
```

**Policy 2: Allow authenticated users to upload**
```sql
CREATE POLICY "Allow authenticated users to upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'films');
```

**Policy 3: Allow admins to delete**
```sql
CREATE POLICY "Allow admins to delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'films' 
  AND exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.is_admin = true
  )
);
```

---

## Step 3: Make Yourself an Admin

Run this in SQL Editor (replace with your user ID):

```sql
-- First, get your user ID from auth.users
-- Or run this after you create an account

-- Option 1: If you know your email
insert into profiles (id, is_admin)
select id, true
from auth.users
where email = 'your-email@example.com'
on conflict (id) do update set is_admin = true;

-- Option 2: Manually insert (get your user ID from Authentication page)
insert into profiles (id, is_admin)
values ('your-user-id-here', true)
on conflict (id) do update set is_admin = true;
```

To find your user ID:
1. Go to **Authentication** → **Users**
2. Find your account
3. Copy the **ID** (UUID format)
4. Use it in the SQL above

---

## Step 4: Test Admin Dashboard

1. **Log in** to your website with your admin account
2. You should see a **"👑 Admin"** button in the navigation
3. Click it to access the Admin Dashboard
4. Try uploading a film!

---

## 🎯 Admin Dashboard Features:

### Upload Tab:
- ✅ Upload video files (MP4, WebM, etc.)
- ✅ Upload poster images (JPG, PNG, etc.)
- ✅ Add film metadata (title, genre, year, duration)
- ✅ Add description
- ✅ Real-time upload progress
- ✅ Success/error messages

### Manage Films Tab:
- ✅ View all uploaded films
- ✅ See film details and thumbnails
- ✅ Delete films (removes from database + storage)
- ✅ Film count
- ✅ Creation date

---

## 📊 Film Database Schema:

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Auto-generated unique ID |
| title | text | Film title (required) |
| description | text | Film description |
| genre | text | Action, Drama, etc. |
| release_year | integer | Year of release |
| duration | text | "2h 15m" format |
| rating | numeric | 0-10 rating |
| video_url | text | Public URL to video |
| poster_url | text | Public URL to poster |
| video_path | text | Storage path |
| poster_path | text | Storage path |
| created_by | uuid | Admin user ID |
| created_at | timestamp | Upload date |

---

## 🎬 Supported Formats:

**Video:** MP4, WebM, MOV, AVI, MKV
**Images:** JPG, PNG, WebP, GIF

**Max file size:** Depends on your Supabase plan (Free: 50MB per file)

---

## ⚠️ Troubleshooting:

### "Permission denied" error:
- Check storage policies are set correctly
- Make sure bucket is public
- Verify you're logged in as admin

### Film doesn't appear after upload:
- Check SQL query results
- Verify films table exists
- Check browser console for errors

### Can't see Admin button:
- Make sure `is_admin = true` in profiles table
- Log out and log back in
- Check your user ID matches

---

**Your Admin Dashboard is ready! 🎉**

Upload your first film and start building your content library!
