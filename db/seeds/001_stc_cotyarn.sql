-- ============================================================
-- seeds/001_stc_cotyarn.sql
-- Initial configuration seed for STC Cotyarn Exim Pvt. Ltd.
-- Populates: org, admin user, shifts, categories, sub-categories,
-- departments, salary components, and all labour tier rates.
-- Run ONCE after migrations on a fresh database.
-- ============================================================

DO $$
DECLARE
  -- tenant
  v_org_id          UUID;

  -- shifts
  v_shift_day12     UUID;   -- Labour: 12hr day
  v_shift_night12   UUID;   -- Labour: 12hr night
  v_shift_morn8     UUID;   -- Maintenance/Staff: 8am-5pm
  v_shift_eve8      UUID;   -- Maintenance/Staff: 4pm-12am
  v_shift_nite8     UUID;   -- Maintenance/Staff: 12am-8am

  -- categories
  v_cat_labour      UUID;
  v_cat_maint       UUID;
  v_cat_staff       UUID;

  -- sub-categories: Labour
  v_sub_skilled     UUID;
  v_sub_trainee     UUID;

  -- sub-categories: Maintenance
  v_sub_maint_wkr   UUID;

  -- sub-categories: Staff
  v_sub_foreman     UUID;
  v_sub_fitter      UUID;
  v_sub_supervisor  UUID;
  v_sub_ass_foreman UUID;
  v_sub_gm          UUID;
  v_sub_hr          UUID;

  -- departments: Labour
  v_dept_l_rf       UUID;
  v_dept_l_pp       UUID;
  v_dept_l_lc       UUID;

  -- departments: Maintenance
  v_dept_m_lc       UUID;
  v_dept_m_rf       UUID;
  v_dept_m_prep     UUID;
  v_dept_m_electric UUID;
  v_dept_m_hplant   UUID;
  v_dept_m_timeoff  UUID;
  v_dept_m_drafting UUID;
  v_dept_m_sqc      UUID;
  v_dept_m_sweeper  UUID;
  v_dept_m_admin    UUID;
  v_dept_m_site     UUID;

  -- salary components
  v_comp_basic      UUID;
  v_comp_da         UUID;
  v_comp_tbasic     UUID;
  v_comp_allow      UUID;
  v_comp_epf        UUID;

BEGIN

  -- ==========================================================
  -- ORGANISATION
  -- ==========================================================
  INSERT INTO organisations (name, city, state)
  VALUES ('STC Cotyarn Exim Pvt. Ltd.', 'Akola', 'Maharashtra')
  RETURNING id INTO v_org_id;

  -- Admin user — change password on first login
  INSERT INTO users (org_id, name, email, password_hash, role)
  VALUES (
    v_org_id,
    'Admin',
    'admin@stccotyarn.com',
    crypt('changeme123', gen_salt('bf', 12)),
    'admin'
  );

  -- ==========================================================
  -- SHIFTS
  -- Labour uses 12hr shifts.
  -- Maintenance and Staff use 8hr shifts (3 rotating).
  -- standard_hours = expected working hours for OT/undertime calc.
  -- 8am-5pm is 9 clock hours but 8 standard hours (1hr break).
  -- ==========================================================

  INSERT INTO shifts (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
  VALUES (v_org_id, 'Day 12hr', '08:00', '20:00', 12, 12, FALSE)
  RETURNING id INTO v_shift_day12;

  INSERT INTO shifts (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
  VALUES (v_org_id, 'Night 12hr', '20:00', '08:00', 12, 12, TRUE)
  RETURNING id INTO v_shift_night12;

  INSERT INTO shifts (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
  VALUES (v_org_id, 'Morning 8hr (8am-5pm)', '08:00', '17:00', 9, 8, FALSE)
  RETURNING id INTO v_shift_morn8;

  INSERT INTO shifts (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
  VALUES (v_org_id, 'Evening 8hr (4pm-12am)', '16:00', '00:00', 8, 8, TRUE)
  RETURNING id INTO v_shift_eve8;

  INSERT INTO shifts (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
  VALUES (v_org_id, 'Night 8hr (12am-8am)', '00:00', '08:00', 8, 8, FALSE)
  RETURNING id INTO v_shift_nite8;

  -- ==========================================================
  -- CATEGORIES
  -- ==========================================================

  INSERT INTO categories (org_id, name, pay_type)
  VALUES (v_org_id, 'Labour', 'tier_based')
  RETURNING id INTO v_cat_labour;

  INSERT INTO categories (org_id, name, pay_type)
  VALUES (v_org_id, 'Maintenance', 'hours_based')
  RETURNING id INTO v_cat_maint;

  INSERT INTO categories (org_id, name, pay_type)
  VALUES (v_org_id, 'Staff', 'hours_based')
  RETURNING id INTO v_cat_staff;

  -- ==========================================================
  -- SUB-CATEGORIES
  -- ==========================================================

  -- Labour: Skilled
  -- salary_type=tier → gross = tier daily_rate × days_present
  -- has_epf=TRUE, has_components=TRUE → full breakdown applies
  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_labour, v_org_id, 'Skilled', 'tier', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_skilled;

  -- Labour: Trainee
  -- salary_type=daily_flat → gross = 420 × days_present, no breakdown, no EPF
  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_labour, v_org_id, 'Trainee', 'daily_flat', 420.00, FALSE, FALSE)
  RETURNING id INTO v_sub_trainee;

  -- Maintenance: single sub-category
  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_maint, v_org_id, 'Maintenance Worker', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_maint_wkr;

  -- Staff sub-categories (all monthly, all have EPF and components)
  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'Foreman', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_foreman;

  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'Fitter', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_fitter;

  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'Supervisor', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_supervisor;

  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'Ass. Foreman', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_ass_foreman;

  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'GM', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_gm;

  INSERT INTO sub_categories (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
  VALUES (v_cat_staff, v_org_id, 'HR', 'monthly', NULL, TRUE, TRUE)
  RETURNING id INTO v_sub_hr;

  -- ==========================================================
  -- DEPARTMENTS
  -- Labour and Maintenance both have departments named LC and RF.
  -- They are separate rows scoped to their respective category_id.
  -- ==========================================================

  -- Labour departments
  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_labour, 'RF')
  RETURNING id INTO v_dept_l_rf;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_labour, 'PP')
  RETURNING id INTO v_dept_l_pp;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_labour, 'LC')
  RETURNING id INTO v_dept_l_lc;

  -- Maintenance departments
  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'LC')
  RETURNING id INTO v_dept_m_lc;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'RF')
  RETURNING id INTO v_dept_m_rf;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Prep')
  RETURNING id INTO v_dept_m_prep;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Electric')
  RETURNING id INTO v_dept_m_electric;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'H Plant')
  RETURNING id INTO v_dept_m_hplant;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Time Office')
  RETURNING id INTO v_dept_m_timeoff;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Drafting')
  RETURNING id INTO v_dept_m_drafting;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'SQC')
  RETURNING id INTO v_dept_m_sqc;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Sweeper')
  RETURNING id INTO v_dept_m_sweeper;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Admin')
  RETURNING id INTO v_dept_m_admin;

  INSERT INTO departments (org_id, category_id, name) VALUES (v_org_id, v_cat_maint, 'Site Worker')
  RETURNING id INTO v_dept_m_site;

  -- ==========================================================
  -- SALARY COMPONENTS
  -- Applies to: Labour Skilled, Maintenance, Staff
  --             (Trainee: has_components=FALSE, skipped by engine)
  --
  -- Calculation order:
  --   1. Basic      = 50% of Gross
  --   2. DA         = 10% of Gross
  --   3. T Basic    = 60% of Gross  ← intermediate, not on payslip
  --                                    referenced by EPF calculation
  --   4. Allowances = 40% of Gross
  --   5. EPF        = 12% of T Basic = 7.2% of Gross (if enrolled)
  -- ==========================================================

  INSERT INTO salary_components (
    org_id, name, type, formula_type,
    formula_value, ref_component_id, calculation_order, is_displayed
  )
  VALUES (v_org_id, 'Basic', 'earning', 'percent_of_gross', 50, NULL, 1, TRUE)
  RETURNING id INTO v_comp_basic;

  INSERT INTO salary_components (
    org_id, name, type, formula_type,
    formula_value, ref_component_id, calculation_order, is_displayed
  )
  VALUES (v_org_id, 'DA', 'earning', 'percent_of_gross', 10, NULL, 2, TRUE)
  RETURNING id INTO v_comp_da;

  -- T Basic: not displayed on payslip, exists only as EPF reference
  INSERT INTO salary_components (
    org_id, name, type, formula_type,
    formula_value, ref_component_id, calculation_order, is_displayed
  )
  VALUES (v_org_id, 'T Basic', 'earning', 'percent_of_gross', 60, NULL, 3, FALSE)
  RETURNING id INTO v_comp_tbasic;

  INSERT INTO salary_components (
    org_id, name, type, formula_type,
    formula_value, ref_component_id, calculation_order, is_displayed
  )
  VALUES (v_org_id, 'Allowances', 'earning', 'percent_of_gross', 40, NULL, 4, TRUE)
  RETURNING id INTO v_comp_allow;

  -- EPF: 12% of T Basic — only applied when employee.epf_enrolled = TRUE
  INSERT INTO salary_components (
    org_id, name, type, formula_type,
    formula_value, ref_component_id, calculation_order, is_displayed
  )
  VALUES (v_org_id, 'EPF', 'deduction', 'percent_of_component', 12, v_comp_tbasic, 5, TRUE)
  RETURNING id INTO v_comp_epf;

  -- ==========================================================
  -- LABOUR TIER RATES
  -- Tier 1 = below 24 days (max_days=23)
  -- Tier 2 = 24 to 25 days
  -- Tier 3 = 26 and above (max_days=NULL = no upper bound)
  -- Rate applies to ALL days present that month, not just extra days.
  -- ==========================================================

  -- RF
  INSERT INTO labour_tier_rates (org_id, department_id, tier, min_days, max_days, daily_rate)
  VALUES
    (v_org_id, v_dept_l_rf, 1,  0, 23,   620.00),
    (v_org_id, v_dept_l_rf, 2, 24, 25,   640.00),
    (v_org_id, v_dept_l_rf, 3, 26, NULL, 680.00);

  -- PP
  INSERT INTO labour_tier_rates (org_id, department_id, tier, min_days, max_days, daily_rate)
  VALUES
    (v_org_id, v_dept_l_pp, 1,  0, 23,   600.00),
    (v_org_id, v_dept_l_pp, 2, 24, 25,   610.00),
    (v_org_id, v_dept_l_pp, 3, 26, NULL, 630.00);

  -- LC
  INSERT INTO labour_tier_rates (org_id, department_id, tier, min_days, max_days, daily_rate)
  VALUES
    (v_org_id, v_dept_l_lc, 1,  0, 23,   600.00),
    (v_org_id, v_dept_l_lc, 2, 24, 25,   610.00),
    (v_org_id, v_dept_l_lc, 3, 26, NULL, 630.00);

  RAISE NOTICE 'Seed complete. Org ID: %', v_org_id;
  RAISE NOTICE 'Change the admin password at admin@stccotyarn.com before going live.';

END $$;
