-- ============================================================
-- WorkLynx – Full Supabase Migration
-- Run this entire script in your Supabase SQL editor.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- SECTION 1: Schema additions
-- ─────────────────────────────────────────────────────────────

-- 1a. Add `type` column to notifications (used by notificationBell.js)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'GENERAL';

-- 1b. Unique constraint on shift_assignments (needed for upsert in recurring.js)
ALTER TABLE public.shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_shift_employee_unique;
ALTER TABLE public.shift_assignments
  ADD CONSTRAINT shift_assignments_shift_employee_unique
  UNIQUE (shift_id, employee_user_id);

-- 1c. Unique constraint on timesheets (one per employee per shift)
ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_shift_employee_unique;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_shift_employee_unique
  UNIQUE (shift_id, employee_user_id);


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: Seed the plans table
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.plans (id, name, monthly_price_usd, max_bo, max_bm, max_managers, max_employees, is_custom)
VALUES
  ('tier_1',       'Starter',      20,   1, 1,   2,   20,  false),
  ('tier_2',       'Professional', 40,   1, 1,   4,   40,  false),
  ('tier_3',       'Business',     80,   1, 1,   8,   80,  false),
  ('tier_4_custom','Enterprise',   null, 1, 3, 999, 9999,  true )
ON CONFLICT (id) DO UPDATE SET
  name              = EXCLUDED.name,
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  max_bo            = EXCLUDED.max_bo,
  max_bm            = EXCLUDED.max_bm,
  max_managers      = EXCLUDED.max_managers,
  max_employees     = EXCLUDED.max_employees,
  is_custom         = EXCLUDED.is_custom;


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: Auto-create profile row on sign-up
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: Helper functions (used in RLS policies)
-- ─────────────────────────────────────────────────────────────

-- Is the calling user an active member of the given org?
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- What role does the calling user have in this org? (NULL if not a member)
CREATE OR REPLACE FUNCTION public.my_org_role(p_org_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text
  FROM public.org_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Is the calling user a platform admin?
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: RPCs called by the frontend
-- ─────────────────────────────────────────────────────────────

-- 5a. list_org_members – returns members with profile data
--     Used by manager/BM/BO pages to show member names
CREATE OR REPLACE FUNCTION public.list_org_members(
  p_org_id uuid,
  p_roles  text[] DEFAULT NULL
)
RETURNS TABLE (
  user_id          uuid,
  role             text,
  is_active        boolean,
  payment_frequency text,
  full_name        text,
  email            text,
  avatar_url       text,
  created_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_org_member(p_org_id) AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    om.role::text,
    om.is_active,
    om.payment_frequency,
    COALESCE(p.full_name, '')::text,
    COALESCE(u.email,     '')::text,
    p.avatar_url,
    om.created_at
  FROM public.org_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  LEFT JOIN auth.users      u ON u.id       = om.user_id
  WHERE om.organization_id = p_org_id
    AND om.is_active = true
    AND (p_roles IS NULL OR om.role::text = ANY(p_roles))
  ORDER BY om.created_at;
END;
$$;

-- 5b. deactivate_org_member – BO/BM only
CREATE OR REPLACE FUNCTION public.deactivate_org_member(
  p_org_id  uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.org_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF v_caller_role NOT IN ('BO', 'BM') THEN
    RAISE EXCEPTION 'Permission denied: only BO or BM can deactivate members';
  END IF;

  UPDATE public.org_members
  SET is_active = false
  WHERE organization_id = p_org_id
    AND user_id = p_user_id;
END;
$$;

-- 5c. assign_shift_to_employee – creates shift_assignment + ensures timesheet exists
CREATE OR REPLACE FUNCTION public.assign_shift_to_employee(
  p_shift_id          uuid,
  p_employee_user_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_caller_role text;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.shifts WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  SELECT role::text INTO v_caller_role
  FROM public.org_members
  WHERE organization_id = v_org_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF v_caller_role NOT IN ('BO', 'BM', 'MANAGER') THEN
    RAISE EXCEPTION 'Permission denied: only MANAGER, BM, or BO can assign shifts';
  END IF;

  INSERT INTO public.shift_assignments
    (shift_id, organization_id, employee_user_id, assigned_by_user_id)
  VALUES
    (p_shift_id, v_org_id, p_employee_user_id, auth.uid())
  ON CONFLICT (shift_id, employee_user_id) DO NOTHING;

  -- Auto-create the timesheet so the employee can clock in immediately
  INSERT INTO public.timesheets
    (organization_id, shift_id, employee_user_id)
  VALUES
    (v_org_id, p_shift_id, p_employee_user_id)
  ON CONFLICT (shift_id, employee_user_id) DO NOTHING;
END;
$$;

-- 5d. unassign_shift_from_employee
CREATE OR REPLACE FUNCTION public.unassign_shift_from_employee(
  p_shift_id          uuid,
  p_employee_user_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_caller_role text;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.shifts WHERE id = p_shift_id;

  SELECT role::text INTO v_caller_role
  FROM public.org_members
  WHERE organization_id = v_org_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF v_caller_role NOT IN ('BO', 'BM', 'MANAGER') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.shift_assignments
  WHERE shift_id = p_shift_id
    AND employee_user_id = p_employee_user_id;
END;
$$;

-- 5e. update_employee_pay_frequency
CREATE OR REPLACE FUNCTION public.update_employee_pay_frequency(
  p_org_id   uuid,
  p_user_id  uuid,
  p_frequency text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.org_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF v_caller_role NOT IN ('BO', 'BM', 'MANAGER') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_frequency NOT IN ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY') THEN
    RAISE EXCEPTION 'Invalid payment frequency: %', p_frequency;
  END IF;

  UPDATE public.org_members
  SET payment_frequency = p_frequency
  WHERE organization_id = p_org_id
    AND user_id = p_user_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: Enable Row Level Security on all tables
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_pay_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_series   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_offers       ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- SECTION 7: RLS Policies
-- Drop all existing policies first to avoid conflicts on re-run
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── profiles ──────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (user_id = auth.uid() OR is_platform_admin());

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

-- ── org_members ───────────────────────────────────────────────
-- Users can see their own memberships; org members can see each other
CREATE POLICY "org_members_select" ON public.org_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_org_member(organization_id)
    OR is_platform_admin()
  );

CREATE POLICY "org_members_insert" ON public.org_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()             -- accepting an invite (own row)
    OR is_platform_admin()
  );

CREATE POLICY "org_members_update" ON public.org_members
  FOR UPDATE USING (
    my_org_role(organization_id) IN ('BO', 'BM')
    OR is_platform_admin()
  );

-- ── organizations ─────────────────────────────────────────────
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    is_org_member(id)
    OR owner_user_id = auth.uid()
    OR is_platform_admin()
  );

CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE USING (
    owner_user_id = auth.uid()
    OR is_platform_admin()
  );

-- ── shifts ────────────────────────────────────────────────────
CREATE POLICY "shifts_select" ON public.shifts
  FOR SELECT USING (is_org_member(organization_id) OR is_platform_admin());

CREATE POLICY "shifts_insert" ON public.shifts
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "shifts_update" ON public.shifts
  FOR UPDATE USING (is_org_member(organization_id));

CREATE POLICY "shifts_delete" ON public.shifts
  FOR DELETE USING (
    my_org_role(organization_id) IN ('BM', 'BO')
    OR is_platform_admin()
  );

-- ── shift_assignments ─────────────────────────────────────────
CREATE POLICY "sa_select" ON public.shift_assignments
  FOR SELECT USING (
    employee_user_id = auth.uid()
    OR is_org_member(organization_id)
  );

CREATE POLICY "sa_insert" ON public.shift_assignments
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "sa_delete" ON public.shift_assignments
  FOR DELETE USING (
    my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO')
    OR is_platform_admin()
  );

-- ── timesheets ────────────────────────────────────────────────
CREATE POLICY "ts_select" ON public.timesheets
  FOR SELECT USING (
    employee_user_id = auth.uid()
    OR my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO')
    OR is_platform_admin()
  );

CREATE POLICY "ts_insert" ON public.timesheets
  FOR INSERT WITH CHECK (
    (employee_user_id = auth.uid() AND is_org_member(organization_id))
    OR is_platform_admin()
  );

CREATE POLICY "ts_update" ON public.timesheets
  FOR UPDATE USING (
    employee_user_id = auth.uid()
    OR my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO')
    OR is_platform_admin()
  );

-- ── time_entries ──────────────────────────────────────────────
CREATE POLICY "te_select" ON public.time_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND (
          t.employee_user_id = auth.uid()
          OR my_org_role(t.organization_id) IN ('MANAGER', 'BM', 'BO')
        )
    )
  );

CREATE POLICY "te_insert" ON public.time_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND t.employee_user_id = auth.uid()
    )
  );

CREATE POLICY "te_update" ON public.time_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
      WHERE t.id = timesheet_id
        AND t.employee_user_id = auth.uid()
    )
  );

-- ── notifications ─────────────────────────────────────────────
-- Users only see their own; any authenticated user can insert (manager notifying employee)
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notif_delete" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- ── invites ───────────────────────────────────────────────────
-- Public SELECT so unauthed accept-invite page can look up by token
CREATE POLICY "invites_select" ON public.invites
  FOR SELECT USING (true);

CREATE POLICY "invites_insert" ON public.invites
  FOR INSERT WITH CHECK (is_org_member(organization_id));

-- Anyone can update (to mark ACCEPTED) — token is the secret
CREATE POLICY "invites_update" ON public.invites
  FOR UPDATE USING (true);

-- ── locations ─────────────────────────────────────────────────
CREATE POLICY "locations_select" ON public.locations
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "locations_write" ON public.locations
  FOR ALL USING (my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO'));

-- ── member_pay_rates ──────────────────────────────────────────
CREATE POLICY "pay_rates_select" ON public.member_pay_rates
  FOR SELECT USING (
    member_user_id = auth.uid()
    OR my_org_role(organization_id) IN ('BM', 'BO')
  );

CREATE POLICY "pay_rates_write" ON public.member_pay_rates
  FOR ALL USING (my_org_role(organization_id) IN ('BM', 'BO'));

-- ── earnings ──────────────────────────────────────────────────
CREATE POLICY "earnings_select" ON public.earnings
  FOR SELECT USING (
    employee_user_id = auth.uid()
    OR my_org_role(organization_id) IN ('BM', 'BO', 'MANAGER')
  );

-- ── recurring_series ──────────────────────────────────────────
CREATE POLICY "rs_select" ON public.recurring_series
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "rs_write" ON public.recurring_series
  FOR ALL USING (my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO'));

-- ── platform_admins ───────────────────────────────────────────
CREATE POLICY "pa_select" ON public.platform_admins
  FOR SELECT USING (user_id = auth.uid() OR is_platform_admin());

-- ── subscriptions ─────────────────────────────────────────────
CREATE POLICY "subs_select" ON public.subscriptions
  FOR SELECT USING (is_org_member(organization_id) OR is_platform_admin());

CREATE POLICY "subs_write" ON public.subscriptions
  FOR ALL USING (is_platform_admin());

-- ── plans (public read) ───────────────────────────────────────
CREATE POLICY "plans_select" ON public.plans
  FOR SELECT USING (true);

-- ── discount_codes ────────────────────────────────────────────
CREATE POLICY "dc_select" ON public.discount_codes
  FOR SELECT USING (active = true OR is_platform_admin());

CREATE POLICY "dc_write" ON public.discount_codes
  FOR ALL USING (is_platform_admin());

-- ── discount_redemptions ──────────────────────────────────────
CREATE POLICY "dr_select" ON public.discount_redemptions
  FOR SELECT USING (redeemed_by_user_id = auth.uid() OR is_platform_admin());

CREATE POLICY "dr_insert" ON public.discount_redemptions
  FOR INSERT WITH CHECK (redeemed_by_user_id = auth.uid());

-- ── shift_offers ──────────────────────────────────────────────
CREATE POLICY "so_select" ON public.shift_offers
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "so_insert" ON public.shift_offers
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "so_update" ON public.shift_offers
  FOR UPDATE USING (
    offered_to_user_id = auth.uid()
    OR my_org_role(organization_id) IN ('MANAGER', 'BM', 'BO')
  );


-- ─────────────────────────────────────────────────────────────
-- SECTION 8: Enable Realtime for notifications
-- (so the notification bell receives live updates)
-- ─────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ─────────────────────────────────────────────────────────────
-- Done!
-- ─────────────────────────────────────────────────────────────
