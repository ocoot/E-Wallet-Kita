-- 1. Enable RLS (Default in Supabase, but explicit)
-- 2. Table: public.users
CREATE TABLE public.users (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  display_name text,
  is_guest boolean DEFAULT false,
  telegram_chat_id bigint UNIQUE,
  preferred_language text DEFAULT 'id',
  preferred_theme text DEFAULT 'dark_obsidian',
  created_at timestamptz DEFAULT now()
);

-- Trigger to create a public.users row on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Table: categories (Master data)
CREATE TABLE public.categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense'))
);

-- 4. Table: transactions
CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  note text,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'ai_web', 'telegram')),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- 5. Table: telegram_link_codes
CREATE TABLE public.telegram_link_codes (
  code text PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false
);

-- 6. Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Users table: users can only read/update their own record
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Categories table: Read only for everyone
CREATE POLICY "Categories are readable by everyone" ON public.categories FOR SELECT USING (true);

-- Transactions table: CRUD by own record
CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- Link codes: CRUD by own record
CREATE POLICY "Users can view their own link codes" ON public.telegram_link_codes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own link codes" ON public.telegram_link_codes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own link codes" ON public.telegram_link_codes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own link codes" ON public.telegram_link_codes FOR DELETE USING (auth.uid() = user_id);

-- 8. Seed Master Data (Categories)
INSERT INTO public.categories (key, type) VALUES
('salary', 'income'),
('bonus', 'income'),
('food_drink', 'expense'),
('monthly_groceries', 'expense'),
('vegetables', 'expense'),
('bills', 'expense'),
('other', 'expense');
