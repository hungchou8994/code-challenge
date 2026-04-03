-- ============================================================
-- SEED DATA — Team Productivity Tracker
-- ============================================================

-- Clean up existing data (order matters for FK)
TRUNCATE TABLE score_events, productivity_scores, tasks, users RESTART IDENTITY CASCADE;

-- ============================================================
-- USERS (6 team members across 3 departments)
-- ============================================================
INSERT INTO users (id, name, email, department, created_at, updated_at) VALUES
  ('u1', 'Alice Nguyen',   'alice@example.com',   'Engineering',  NOW() - INTERVAL '30 days', NOW()),
  ('u2', 'Bob Tran',       'bob@example.com',     'Engineering',  NOW() - INTERVAL '28 days', NOW()),
  ('u3', 'Carol Le',       'carol@example.com',   'Design',       NOW() - INTERVAL '25 days', NOW()),
  ('u4', 'David Pham',     'david@example.com',   'Design',       NOW() - INTERVAL '20 days', NOW()),
  ('u5', 'Eva Hoang',      'eva@example.com',     'Marketing',    NOW() - INTERVAL '15 days', NOW()),
  ('u6', 'Frank Vo',       'frank@example.com',   'Marketing',    NOW() - INTERVAL '10 days', NOW());

-- ============================================================
-- TASKS
-- Mix of TODO / IN_PROGRESS / DONE, all 3 priorities
-- ============================================================
INSERT INTO tasks (id, title, description, status, priority, assignee_id, due_date, created_at, updated_at) VALUES

  -- DONE tasks (these generate scores)
  ('t1',  'Setup CI/CD pipeline',           'Configure GitHub Actions for auto-deploy',        'DONE',        'HIGH',   'u1', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '20 days', NOW() - INTERVAL '2 days'),
  ('t2',  'Design landing page mockup',     'Create Figma wireframes for homepage',            'DONE',        'MEDIUM', 'u3', NOW() - INTERVAL '5 days',  NOW() - INTERVAL '18 days', NOW() - INTERVAL '5 days'),
  ('t3',  'Write API documentation',        'Document all REST endpoints with examples',       'DONE',        'MEDIUM', 'u2', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '15 days', NOW() - INTERVAL '3 days'),
  ('t4',  'Fix login page bug',             'Users unable to login with special characters',   'DONE',        'HIGH',   'u1', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '12 days', NOW() - INTERVAL '1 day'),
  ('t5',  'Social media campaign Q2',       'Plan and schedule posts for April–June',          'DONE',        'HIGH',   'u5', NOW() + INTERVAL '5 days',  NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day'),
  ('t6',  'Redesign dashboard UI',          'Improve dashboard layout based on user feedback', 'DONE',        'HIGH',   'u3', NOW() - INTERVAL '4 days',  NOW() - INTERVAL '14 days', NOW() - INTERVAL '4 days'),
  ('t7',  'Database query optimization',    'Optimize slow queries on reports page',           'DONE',        'MEDIUM', 'u2', NOW() - INTERVAL '6 days',  NOW() - INTERVAL '16 days', NOW() - INTERVAL '6 days'),
  ('t8',  'Brand identity refresh',         'Update color palette and typography guide',       'DONE',        'LOW',    'u4', NOW() - INTERVAL '7 days',  NOW() - INTERVAL '22 days', NOW() - INTERVAL '7 days'),
  ('t9',  'Email newsletter template',      'Design responsive HTML email template',           'DONE',        'LOW',    'u5', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '20 days', NOW() - INTERVAL '8 days'),
  ('t10', 'Unit tests for auth module',     'Achieve 90% coverage on authentication',         'DONE',        'HIGH',   'u1', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '11 days', NOW() - INTERVAL '3 days'),

  -- IN_PROGRESS tasks
  ('t11', 'Mobile responsive fixes',        'Fix layout issues on screens < 768px',            'IN_PROGRESS', 'HIGH',   'u2', NOW() + INTERVAL '3 days',  NOW() - INTERVAL '5 days',  NOW()),
  ('t12', 'User onboarding flow',           'Design step-by-step onboarding for new users',    'IN_PROGRESS', 'MEDIUM', 'u3', NOW() + INTERVAL '7 days',  NOW() - INTERVAL '4 days',  NOW()),
  ('t13', 'SEO audit and fixes',            'Improve page speed and meta tags across site',    'IN_PROGRESS', 'MEDIUM', 'u5', NOW() + INTERVAL '5 days',  NOW() - INTERVAL '3 days',  NOW()),
  ('t14', 'Performance profiling backend',  'Profile API response times under load',           'IN_PROGRESS', 'HIGH',   'u1', NOW() + INTERVAL '2 days',  NOW() - INTERVAL '2 days',  NOW()),
  ('t15', 'Competitor analysis report',     'Research top 5 competitors features and pricing', 'IN_PROGRESS', 'LOW',    'u6', NOW() + INTERVAL '10 days', NOW() - INTERVAL '6 days',  NOW()),

  -- TODO tasks
  ('t16', 'Implement dark mode',            'Add dark/light theme toggle to settings page',    'TODO',        'LOW',    'u2', NOW() + INTERVAL '14 days', NOW() - INTERVAL '1 day',   NOW()),
  ('t17', 'Payment gateway integration',   'Integrate Stripe for subscription billing',       'TODO',        'HIGH',   'u1', NOW() + INTERVAL '10 days', NOW() - INTERVAL '2 days',  NOW()),
  ('t18', 'Create icon set',               'Design 50 custom icons for the product',          'TODO',        'MEDIUM', 'u4', NOW() + INTERVAL '12 days', NOW() - INTERVAL '3 days',  NOW()),
  ('t19', 'Q3 marketing plan',             'Define goals, budget and channels for Q3',        'TODO',        'HIGH',   'u6', NOW() + INTERVAL '20 days', NOW() - INTERVAL '1 day',   NOW()),
  ('t20', 'Accessibility audit',           'Ensure WCAG 2.1 AA compliance across all pages',  'TODO',        'LOW',    NULL, NOW() + INTERVAL '30 days', NOW(),                       NOW());

-- ============================================================
-- SCORE EVENTS (for each DONE task)
-- Scoring: LOW=5, MEDIUM=10, HIGH=20; early bonus=+5, late penalty=-3
-- t1  HIGH  early (due was -2d, done -2d = on time, but created early) => 20+5=25
-- t2  MEDIUM late (due -5d, done -5d on time)                          => 10
-- t3  MEDIUM on time                                                    => 10
-- t4  HIGH  early                                                       => 20+5=25
-- t5  HIGH  early (due +5d, done already)                              => 20+5=25
-- t6  HIGH  early                                                       => 20+5=25
-- t7  MEDIUM on time                                                    => 10
-- t8  LOW   on time                                                     => 5
-- t9  LOW   on time                                                     => 5
-- t10 HIGH  early                                                       => 20+5=25
-- ============================================================
INSERT INTO score_events (id, user_id, task_id, points, bonus, penalty, total_awarded, created_at) VALUES
  ('se1',  'u1', 't1',  20, 5, 0, 25, NOW() - INTERVAL '2 days'),
  ('se2',  'u3', 't2',  10, 0, 0, 10, NOW() - INTERVAL '5 days'),
  ('se3',  'u2', 't3',  10, 0, 0, 10, NOW() - INTERVAL '3 days'),
  ('se4',  'u1', 't4',  20, 5, 0, 25, NOW() - INTERVAL '1 day'),
  ('se5',  'u5', 't5',  20, 5, 0, 25, NOW() - INTERVAL '1 day'),
  ('se6',  'u3', 't6',  20, 5, 0, 25, NOW() - INTERVAL '4 days'),
  ('se7',  'u2', 't7',  10, 0, 0, 10, NOW() - INTERVAL '6 days'),
  ('se8',  'u4', 't8',   5, 0, 0,  5, NOW() - INTERVAL '7 days'),
  ('se9',  'u5', 't9',   5, 0, 0,  5, NOW() - INTERVAL '8 days'),
  ('se10', 'u1', 't10', 20, 5, 0, 25, NOW() - INTERVAL '3 days');

-- ============================================================
-- PRODUCTIVITY SCORES (aggregate per user)
-- u1: se1(25) + se4(25) + se10(25) = 75, 3 tasks
-- u2: se3(10) + se7(10)            = 20, 2 tasks
-- u3: se2(10) + se6(25)            = 35, 2 tasks
-- u4: se8(5)                       =  5, 1 task
-- u5: se5(25) + se9(5)             = 30, 2 tasks
-- u6: 0 tasks done yet
-- ============================================================
INSERT INTO productivity_scores (id, user_id, total_score, tasks_completed, updated_at) VALUES
  ('ps1', 'u1', 75, 3, NOW()),
  ('ps2', 'u2', 20, 2, NOW()),
  ('ps3', 'u3', 35, 2, NOW()),
  ('ps4', 'u4',  5, 1, NOW()),
  ('ps5', 'u5', 30, 2, NOW()),
  ('ps6', 'u6',  0, 0, NOW());
