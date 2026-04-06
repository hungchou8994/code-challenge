-- ============================================================
-- SEED DATA — Team Productivity Tracker
-- ============================================================
-- Run once after `docker compose up --build`:
--   docker exec -i <db-container> psql -U postgres -d productivity_tracker < seed.sql
--
-- Safe to re-run: TRUNCATE at the top clears all data first.
-- ============================================================

-- Clean up existing data (order matters for FK)
TRUNCATE TABLE score_events, productivity_scores, tasks, users RESTART IDENTITY CASCADE;

-- ============================================================
-- USERS (6 core team members across 3 departments)
-- ============================================================
INSERT INTO users (id, name, email, department, created_at, updated_at) VALUES
  ('db6cd388-0abf-538a-8503-dd3358d93458', 'Alice Nguyen',   'alice@example.com',   'Engineering',  NOW() - INTERVAL '30 days', NOW()),
  ('256bfca0-761e-5058-8d12-d39fd1b216f2', 'Bob Tran',       'bob@example.com',     'Engineering',  NOW() - INTERVAL '28 days', NOW()),
  ('ac08596c-c23e-5a6e-a28c-0dce69394d0c', 'Carol Le',       'carol@example.com',   'Design',       NOW() - INTERVAL '25 days', NOW()),
  ('1c68f4cf-b3f7-5ad9-b682-a3022631ae74', 'David Pham',     'david@example.com',   'Design',       NOW() - INTERVAL '20 days', NOW()),
  ('9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', 'Eva Hoang',      'eva@example.com',     'Marketing',    NOW() - INTERVAL '15 days', NOW()),
  ('bae940b3-7149-54b8-a5bf-f8880d6c3e13', 'Frank Vo',       'frank@example.com',   'Marketing',    NOW() - INTERVAL '10 days', NOW());

-- ============================================================
-- TASKS (core set)
-- Mix of TODO / IN_PROGRESS / DONE, all 3 priorities
-- ============================================================
INSERT INTO tasks (id, title, description, status, priority, assignee_id, due_date, created_at, updated_at) VALUES

  -- DONE tasks (these generate scores)
  ('4be2fac9-d3c7-50d7-aa40-e4a676461eb2',  'Setup CI/CD pipeline',           'Configure GitHub Actions for auto-deploy',        'DONE',        'HIGH',   'db6cd388-0abf-538a-8503-dd3358d93458', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '20 days', NOW() - INTERVAL '2 days'),
  ('c75eed41-b8c7-5e8f-a8e6-80e20562a903',  'Design landing page mockup',     'Create Figma wireframes for homepage',            'DONE',        'MEDIUM', 'ac08596c-c23e-5a6e-a28c-0dce69394d0c', NOW() - INTERVAL '5 days',  NOW() - INTERVAL '18 days', NOW() - INTERVAL '5 days'),
  ('dfc12cf0-c286-5526-8753-a23e909dbff2',  'Write API documentation',        'Document all REST endpoints with examples',       'DONE',        'MEDIUM', '256bfca0-761e-5058-8d12-d39fd1b216f2', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '15 days', NOW() - INTERVAL '3 days'),
  ('80ac910d-3feb-50f6-9eb1-81d919a7f46e',  'Fix login page bug',             'Users unable to login with special characters',   'DONE',        'HIGH',   'db6cd388-0abf-538a-8503-dd3358d93458', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '12 days', NOW() - INTERVAL '1 day'),
  ('31b778aa-37fd-53df-bc99-f39f74679167',  'Social media campaign Q2',       'Plan and schedule posts for April–June',          'DONE',        'HIGH',   '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', NOW() + INTERVAL '5 days',  NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day'),
  ('133458db-cbbe-5824-8551-323fe12addb1',  'Redesign dashboard UI',          'Improve dashboard layout based on user feedback', 'DONE',        'HIGH',   'ac08596c-c23e-5a6e-a28c-0dce69394d0c', NOW() - INTERVAL '4 days',  NOW() - INTERVAL '14 days', NOW() - INTERVAL '4 days'),
  ('8c1f0210-43e6-5931-96f1-9647d0789ff9',  'Database query optimization',    'Optimize slow queries on reports page',           'DONE',        'MEDIUM', '256bfca0-761e-5058-8d12-d39fd1b216f2', NOW() - INTERVAL '6 days',  NOW() - INTERVAL '16 days', NOW() - INTERVAL '6 days'),
  ('3b5905a9-015d-5d2e-b88c-67743c2c1e6a',  'Brand identity refresh',         'Update color palette and typography guide',       'DONE',        'LOW',    '1c68f4cf-b3f7-5ad9-b682-a3022631ae74', NOW() - INTERVAL '7 days',  NOW() - INTERVAL '22 days', NOW() - INTERVAL '7 days'),
  ('7d04e472-ecf0-51a3-868b-75fd3df54949',  'Email newsletter template',      'Design responsive HTML email template',           'DONE',        'LOW',    '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '20 days', NOW() - INTERVAL '8 days'),
  ('4efe1e9b-dc5f-5a1e-8922-c20951c405a1', 'Unit tests for auth module',     'Achieve 90% coverage on authentication',         'DONE',        'HIGH',   'db6cd388-0abf-538a-8503-dd3358d93458', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '11 days', NOW() - INTERVAL '3 days'),

  -- IN_PROGRESS tasks
  ('d6b31f8a-1424-5f97-bca8-d4d6023f00ec', 'Mobile responsive fixes',        'Fix layout issues on screens < 768px',            'IN_PROGRESS', 'HIGH',   '256bfca0-761e-5058-8d12-d39fd1b216f2', NOW() + INTERVAL '3 days',  NOW() - INTERVAL '5 days',  NOW()),
  ('6a64a459-70fc-5e76-a5f8-0ba17e390423', 'User onboarding flow',           'Design step-by-step onboarding for new users',    'IN_PROGRESS', 'MEDIUM', 'ac08596c-c23e-5a6e-a28c-0dce69394d0c', NOW() + INTERVAL '7 days',  NOW() - INTERVAL '4 days',  NOW()),
  ('3831ba39-4f00-596a-9d43-4d5fdc992e22', 'SEO audit and fixes',            'Improve page speed and meta tags across site',    'IN_PROGRESS', 'MEDIUM', '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', NOW() + INTERVAL '5 days',  NOW() - INTERVAL '3 days',  NOW()),
  ('cd8fd239-ce27-5913-95bf-5a24434a59e8', 'Performance profiling backend',  'Profile API response times under load',           'IN_PROGRESS', 'HIGH',   'db6cd388-0abf-538a-8503-dd3358d93458', NOW() + INTERVAL '2 days',  NOW() - INTERVAL '2 days',  NOW()),
  ('7248607d-f89c-5d66-8192-a77a7d5064ce', 'Competitor analysis report',     'Research top 5 competitors features and pricing', 'IN_PROGRESS', 'LOW',    'bae940b3-7149-54b8-a5bf-f8880d6c3e13', NOW() + INTERVAL '10 days', NOW() - INTERVAL '6 days',  NOW()),

  -- TODO tasks
  ('e8427d66-3cbe-5087-88bf-fc17bdb1114e', 'Implement dark mode',            'Add dark/light theme toggle to settings page',    'TODO',        'LOW',    '256bfca0-761e-5058-8d12-d39fd1b216f2', NOW() + INTERVAL '14 days', NOW() - INTERVAL '1 day',   NOW()),
  ('41684c53-af5e-51b6-992d-c6a31ba10373', 'Payment gateway integration',   'Integrate Stripe for subscription billing',       'TODO',        'HIGH',   'db6cd388-0abf-538a-8503-dd3358d93458', NOW() + INTERVAL '10 days', NOW() - INTERVAL '2 days',  NOW()),
  ('c33cc803-6920-5b1e-bb75-a997c1991c73', 'Create icon set',               'Design 50 custom icons for the product',          'TODO',        'MEDIUM', '1c68f4cf-b3f7-5ad9-b682-a3022631ae74', NOW() + INTERVAL '12 days', NOW() - INTERVAL '3 days',  NOW()),
  ('5d865d0a-f277-5d28-b987-48d11a4cea25', 'Q3 marketing plan',             'Define goals, budget and channels for Q3',        'TODO',        'HIGH',   'bae940b3-7149-54b8-a5bf-f8880d6c3e13', NOW() + INTERVAL '20 days', NOW() - INTERVAL '1 day',   NOW()),
  ('9d88baac-b803-5e92-8ad4-f42b7e2aa972', 'Accessibility audit',           'Ensure WCAG 2.1 AA compliance across all pages',  'TODO',        'LOW',    NULL, NOW() + INTERVAL '30 days', NOW(),                       NOW());

-- ============================================================
-- SCORE EVENTS for core DONE tasks
-- Scoring: LOW=5, MEDIUM=10, HIGH=20; early bonus=+5, late penalty=-3
-- t1  HIGH  early => 20+5=25
-- t2  MEDIUM on time => 10
-- t3  MEDIUM on time => 10
-- t4  HIGH  early => 20+5=25
-- t5  HIGH  early (due +5d, already done) => 20+5=25
-- t6  HIGH  early => 20+5=25
-- t7  MEDIUM on time => 10
-- t8  LOW   on time => 5
-- t9  LOW   on time => 5
-- t10 HIGH  early => 20+5=25
-- ============================================================
INSERT INTO score_events (id, user_id, task_id, points, bonus, penalty, total_awarded, created_at) VALUES
  ('da00538e-54b2-5947-8847-cda9776d65cb',  'db6cd388-0abf-538a-8503-dd3358d93458', '4be2fac9-d3c7-50d7-aa40-e4a676461eb2',  20, 5, 0, 25, NOW() - INTERVAL '2 days'),
  ('a98652f2-cfa3-578a-8e61-b41f95f0ec39',  'ac08596c-c23e-5a6e-a28c-0dce69394d0c', 'c75eed41-b8c7-5e8f-a8e6-80e20562a903',  10, 0, 0, 10, NOW() - INTERVAL '5 days'),
  ('2b70d00b-2efc-5c5b-8249-850b63744372',  '256bfca0-761e-5058-8d12-d39fd1b216f2', 'dfc12cf0-c286-5526-8753-a23e909dbff2',  10, 0, 0, 10, NOW() - INTERVAL '3 days'),
  ('3b83556a-0c65-56c5-a88c-f7d6805d12f0',  'db6cd388-0abf-538a-8503-dd3358d93458', '80ac910d-3feb-50f6-9eb1-81d919a7f46e',  20, 5, 0, 25, NOW() - INTERVAL '1 day'),
  ('2175ec64-2948-5a59-a847-3a3e1a41a026',  '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', '31b778aa-37fd-53df-bc99-f39f74679167',  20, 5, 0, 25, NOW() - INTERVAL '1 day'),
  ('36a4972f-ba06-5136-aa98-1028ba8baefe',  'ac08596c-c23e-5a6e-a28c-0dce69394d0c', '133458db-cbbe-5824-8551-323fe12addb1',  20, 5, 0, 25, NOW() - INTERVAL '4 days'),
  ('ddeccf0a-45e5-5d12-93d0-50f8c4708d7d',  '256bfca0-761e-5058-8d12-d39fd1b216f2', '8c1f0210-43e6-5931-96f1-9647d0789ff9',  10, 0, 0, 10, NOW() - INTERVAL '6 days'),
  ('ec800ab4-55e0-5e88-9cad-79d21de175f4',  '1c68f4cf-b3f7-5ad9-b682-a3022631ae74', '3b5905a9-015d-5d2e-b88c-67743c2c1e6a',   5, 0, 0,  5, NOW() - INTERVAL '7 days'),
  ('549b7af8-9b1c-58eb-9da8-238588fe4d28',  '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', '7d04e472-ecf0-51a3-868b-75fd3df54949',   5, 0, 0,  5, NOW() - INTERVAL '8 days'),
  ('ad0b0cb2-07d9-5225-96f9-78880f9f4669', 'db6cd388-0abf-538a-8503-dd3358d93458', '4efe1e9b-dc5f-5a1e-8922-c20951c405a1', 20, 5, 0, 25, NOW() - INTERVAL '3 days');

-- ============================================================
-- PRODUCTIVITY SCORES (aggregate per core user)
-- u1: se1(25) + se4(25) + se10(25) = 75, 3 tasks
-- u2: se3(10) + se7(10)            = 20, 2 tasks
-- u3: se2(10) + se6(25)            = 35, 2 tasks
-- u4: se8(5)                       =  5, 1 task
-- u5: se5(25) + se9(5)             = 30, 2 tasks
-- u6: 0 tasks done yet
-- ============================================================
INSERT INTO productivity_scores (id, user_id, total_score, tasks_completed, updated_at) VALUES
  ('a18272d1-99eb-5b6e-b7a0-c910f8b66137', 'db6cd388-0abf-538a-8503-dd3358d93458', 75, 3, NOW()),
  ('6277d6a3-44bb-524a-98ed-e245c7d61930', '256bfca0-761e-5058-8d12-d39fd1b216f2', 20, 2, NOW()),
  ('f4831c30-e19e-5b8a-9fed-0a1ae6bcf533', 'ac08596c-c23e-5a6e-a28c-0dce69394d0c', 35, 2, NOW()),
  ('0f1bbada-827e-5921-bbff-5ba5716201fb', '1c68f4cf-b3f7-5ad9-b682-a3022631ae74',  5, 1, NOW()),
  ('207b66e7-ed77-53b7-9e2e-2b18f386ecc0', '9ff6e3c4-5da5-58c7-8da8-dfe3db9553d9', 30, 2, NOW()),
  ('e8c754d3-51ea-5d9a-8c24-57fe1338374d', 'bae940b3-7149-54b8-a5bf-f8880d6c3e13',  0, 0, NOW());

-- ============================================================
-- BULK DATA — 100 extra users + 300 extra tasks
-- ============================================================

-- -----------------------------------------------
-- 100 USERS
-- -----------------------------------------------
INSERT INTO users (id, name, email, department, created_at, updated_at) VALUES
('08fc5f51-4d44-5851-8c0f-a5b969ecabdc','Liam Johnson','liam.johnson@example.com','Engineering',NOW()-INTERVAL '90 days',NOW()),
('add3fd41-3b28-586a-8c57-0a55ec530823','Olivia Smith','olivia.smith@example.com','Design',NOW()-INTERVAL '88 days',NOW()),
('5e7a8f7b-9d75-5734-9e57-8724c334a062','Noah Williams','noah.williams@example.com','Marketing',NOW()-INTERVAL '86 days',NOW()),
('d8012307-1f60-595a-afe8-3c03d9797f3d','Emma Brown','emma.brown@example.com','Engineering',NOW()-INTERVAL '85 days',NOW()),
('0b96e401-0bb5-599e-84db-bd438bfb0138','Oliver Jones','oliver.jones@example.com','HR',NOW()-INTERVAL '84 days',NOW()),
('b6216c46-39c0-5a31-b9d8-bf2fdf0a561c','Ava Garcia','ava.garcia@example.com','Design',NOW()-INTERVAL '83 days',NOW()),
('f05c21ed-0beb-5ef6-b36b-074423ba5dec','Elijah Martinez','elijah.martinez@example.com','Engineering',NOW()-INTERVAL '82 days',NOW()),
('d9332364-4056-5384-b62b-d8f415b4029f','Sophia Anderson','sophia.anderson@example.com','Marketing',NOW()-INTERVAL '81 days',NOW()),
('9fcc5215-f3d2-5391-af52-678baa4e1bb5','Lucas Taylor','lucas.taylor@example.com','HR',NOW()-INTERVAL '80 days',NOW()),
('a736ae42-8dca-5298-93f1-99eeaa511037','Isabella Thomas','isabella.thomas@example.com','Engineering',NOW()-INTERVAL '79 days',NOW()),
('d6c44974-67f0-5439-bf46-ec5fbb7c08f2','Mason Hernandez','mason.hernandez@example.com','Design',NOW()-INTERVAL '78 days',NOW()),
('bfde5230-00e1-5b64-9648-8d6c76c8f45a','Mia Moore','mia.moore@example.com','Marketing',NOW()-INTERVAL '77 days',NOW()),
('4b1a1c5a-044e-52e0-95a8-e23880b4f72c','Ethan Jackson','ethan.jackson@example.com','Engineering',NOW()-INTERVAL '76 days',NOW()),
('2010c087-c136-5f7b-9b5e-4237c81d817d','Amelia Martin','amelia.martin@example.com','HR',NOW()-INTERVAL '75 days',NOW()),
('84ed3d98-1580-521b-926e-a086f848d988','James Lee','james.lee@example.com','Design',NOW()-INTERVAL '74 days',NOW()),
('13ad6e40-005e-57a1-b7f3-b6eac45600d3','Harper Perez','harper.perez@example.com','Engineering',NOW()-INTERVAL '73 days',NOW()),
('d27309da-464c-5db4-bf9e-698816e45294','Benjamin Thompson','benjamin.thompson@example.com','Marketing',NOW()-INTERVAL '72 days',NOW()),
('e6984908-9d60-572e-936a-216817b13941','Evelyn White','evelyn.white@example.com','Design',NOW()-INTERVAL '71 days',NOW()),
('8a64a264-b243-548f-934c-4bde8d2a386e','Henry Harris','henry.harris@example.com','Engineering',NOW()-INTERVAL '70 days',NOW()),
('2f99570e-7562-58ad-a6cb-ccad00465119','Abigail Sanchez','abigail.sanchez@example.com','HR',NOW()-INTERVAL '69 days',NOW()),
('08b516dc-85fb-57c9-8f83-740207dc6995','Alexander Clark','alexander.clark@example.com','Marketing',NOW()-INTERVAL '68 days',NOW()),
('57fc2970-86bb-54d7-ad76-f87400903759','Emily Ramirez','emily.ramirez@example.com','Engineering',NOW()-INTERVAL '67 days',NOW()),
('abef3e3a-2a04-5076-b48a-03a821059994','Michael Lewis','michael.lewis@example.com','Design',NOW()-INTERVAL '66 days',NOW()),
('68ca7dad-a4e7-596a-ad71-2459e296ae3e','Elizabeth Robinson','elizabeth.robinson@example.com','HR',NOW()-INTERVAL '65 days',NOW()),
('9293afa1-acff-5592-b506-11fe24e62e9b','Daniel Walker','daniel.walker@example.com','Engineering',NOW()-INTERVAL '64 days',NOW()),
('1a016386-460e-5d3b-a49c-9fd277d425ca','Sofia Young','sofia.young@example.com','Marketing',NOW()-INTERVAL '63 days',NOW()),
('c14054a7-7d4f-5eac-86ca-c312c7403480','Matthew Allen','matthew.allen@example.com','Design',NOW()-INTERVAL '62 days',NOW()),
('a1956b30-3db0-51a5-a63a-1ab869110f08','Avery King','avery.king@example.com','Engineering',NOW()-INTERVAL '61 days',NOW()),
('141ae427-06c6-535b-9274-678c6f0aa4f1','Jackson Wright','jackson.wright@example.com','HR',NOW()-INTERVAL '60 days',NOW()),
('e62381b0-29b7-55d7-906c-8d56f2eeddda','Scarlett Scott','scarlett.scott@example.com','Marketing',NOW()-INTERVAL '59 days',NOW()),
('373aa24a-3d48-536d-b2e9-4dc2e1ff58d4','Sebastian Torres','sebastian.torres@example.com','Engineering',NOW()-INTERVAL '58 days',NOW()),
('5e2602c8-5e7a-54d3-9dff-d1dda23967ef','Aria Nguyen','aria.nguyen@example.com','Design',NOW()-INTERVAL '57 days',NOW()),
('74ba569a-7c7f-5539-8639-aac1fe7d1dbe','Jack Hill','jack.hill@example.com','HR',NOW()-INTERVAL '56 days',NOW()),
('dc8d6390-79cc-51bf-9b32-91000a84d3d0','Luna Flores','luna.flores@example.com','Engineering',NOW()-INTERVAL '55 days',NOW()),
('230b266f-4b3c-569b-b6c7-21de47d36796','Owen Green','owen.green@example.com','Marketing',NOW()-INTERVAL '54 days',NOW()),
('567ef416-5a09-5f1c-b7d4-fdabad44bf66','Chloe Adams','chloe.adams@example.com','Design',NOW()-INTERVAL '53 days',NOW()),
('8ad71ffa-533c-5329-885e-e802e13cccfd','Wyatt Nelson','wyatt.nelson@example.com','Engineering',NOW()-INTERVAL '52 days',NOW()),
('512e5915-5937-54b1-8ccc-d20cd174c4a9','Penelope Carter','penelope.carter@example.com','HR',NOW()-INTERVAL '51 days',NOW()),
('bd38c615-7883-5c8b-94b7-c09b38ca65f5','Gabriel Mitchell','gabriel.mitchell@example.com','Marketing',NOW()-INTERVAL '50 days',NOW()),
('3c11f877-a165-52df-bb5d-f692b0e757f0','Riley Perez','riley.perez@example.com','Engineering',NOW()-INTERVAL '49 days',NOW()),
('5b99f16a-71fa-54a8-8a55-622cc0bb7e1c','Zoey Roberts','zoey.roberts@example.com','Design',NOW()-INTERVAL '48 days',NOW()),
('047be7b6-ab77-5b6a-93b7-55d8b6e38ec3','Carter Turner','carter.turner@example.com','HR',NOW()-INTERVAL '47 days',NOW()),
('71789cf9-6288-5767-85ae-3d4efe684a9c','Nora Phillips','nora.phillips@example.com','Engineering',NOW()-INTERVAL '46 days',NOW()),
('310e45bb-60df-50d9-8e6d-12c418ab622c','Anthony Campbell','anthony.campbell@example.com','Marketing',NOW()-INTERVAL '45 days',NOW()),
('f375ba5d-6c27-5a7f-9d85-3cbf5c368ccb','Lily Parker','lily.parker@example.com','Design',NOW()-INTERVAL '44 days',NOW()),
('4547e5e2-dcaf-5fe3-87e0-950367613bfc','Dylan Evans','dylan.evans@example.com','Engineering',NOW()-INTERVAL '43 days',NOW()),
('23e4bc44-50ef-5421-9cce-b2017f31dff7','Hannah Edwards','hannah.edwards@example.com','HR',NOW()-INTERVAL '42 days',NOW()),
('fc2885d7-52a3-5a00-95bb-24045d600250','Isaac Collins','isaac.collins@example.com','Marketing',NOW()-INTERVAL '41 days',NOW()),
('dda8ff58-c611-50f9-8714-d53ca244ed3c','Addison Stewart','addison.stewart@example.com','Engineering',NOW()-INTERVAL '40 days',NOW()),
('7c63122e-c11c-5e81-8091-118841ffb597','Joshua Sanchez','joshua.sanchez@example.com','Design',NOW()-INTERVAL '39 days',NOW()),
('f497693a-b965-5c86-81cf-385d0b3ae28c','Eleanor Morris','eleanor.morris@example.com','HR',NOW()-INTERVAL '38 days',NOW()),
('f8247016-9cda-5543-a7e9-110be27b15f1','Andrew Rogers','andrew.rogers@example.com','Engineering',NOW()-INTERVAL '37 days',NOW()),
('b5928358-636b-57bc-b3d0-a268c5459b3a','Leah Reed','leah.reed@example.com','Marketing',NOW()-INTERVAL '36 days',NOW()),
('42b1e5a5-3b3f-5305-a74f-b560135340f5','Ryan Cook','ryan.cook@example.com','Design',NOW()-INTERVAL '35 days',NOW()),
('73262575-58a0-5da7-ae54-236dfe5be4bd','Lillian Morgan','lillian.morgan@example.com','HR',NOW()-INTERVAL '34 days',NOW()),
('b8405422-5f14-59cd-a88b-61d85892edf8','Nathan Bell','nathan.bell@example.com','Engineering',NOW()-INTERVAL '33 days',NOW()),
('f1cb83d0-e8fa-5dc5-ae40-a6d40eb4f51b','Aubrey Murphy','aubrey.murphy@example.com','Marketing',NOW()-INTERVAL '32 days',NOW()),
('c5057b04-c2d1-5c81-9f9b-b38684fc96ac','Christian Bailey','christian.bailey@example.com','Design',NOW()-INTERVAL '31 days',NOW()),
('6d2dc866-7797-58f4-9695-9bc5421fcca6','Savannah Rivera','savannah.rivera@example.com','Engineering',NOW()-INTERVAL '30 days',NOW()),
('fbee04ac-5ce8-5f5f-9259-c3d19aa9bc10','Jonathan Cooper','jonathan.cooper@example.com','HR',NOW()-INTERVAL '29 days',NOW()),
('e599486a-aabc-5168-9671-e7ef84c21967','Brooklyn Richardson','brooklyn.richardson@example.com','Marketing',NOW()-INTERVAL '28 days',NOW()),
('eb215a3f-59c9-571a-ba2c-fc564021de65','Aaron Cox','aaron.cox@example.com','Engineering',NOW()-INTERVAL '27 days',NOW()),
('22160486-b3c7-5162-8958-9fd494d754b5','Audrey Howard','audrey.howard@example.com','Design',NOW()-INTERVAL '26 days',NOW()),
('fef7518b-d5c1-5b4a-96ba-46e60b4cc3ba','Dominic Ward','dominic.ward@example.com','HR',NOW()-INTERVAL '25 days',NOW()),
('70cca839-6b19-58e4-8924-e38d88b33cca','Bella Torres','bella.torres@example.com','Marketing',NOW()-INTERVAL '24 days',NOW()),
('0ab380c8-6f99-587c-b0cc-f3d1c8e94f9a','Levi Peterson','levi.peterson@example.com','Engineering',NOW()-INTERVAL '23 days',NOW()),
('4ea8a886-f299-5b08-9d75-910117b4e1c6','Claire Gray','claire.gray@example.com','Design',NOW()-INTERVAL '22 days',NOW()),
('56c26fed-b0e2-5025-be0b-ca0c936ca04e','Caleb Ramirez','caleb.ramirez@example.com','HR',NOW()-INTERVAL '21 days',NOW()),
('e00c2562-d4d6-55a6-a41d-ee73d2c7be6e','Skylar James','skylar.james@example.com','Marketing',NOW()-INTERVAL '20 days',NOW()),
('c09b2121-93b2-5dc7-9cdc-3402e7be7a4d','Hunter Watson','hunter.watson@example.com','Engineering',NOW()-INTERVAL '19 days',NOW()),
('6a6928b9-9e5a-5719-8307-973618acaaf0','Layla Brooks','layla.brooks@example.com','Design',NOW()-INTERVAL '18 days',NOW()),
('3788aed4-622f-597b-8d2c-b36cae584778','Eli Kelly','eli.kelly@example.com','HR',NOW()-INTERVAL '17 days',NOW()),
('03653e21-8377-5d46-86ca-dec3e9489633','Anna Sanders','anna.sanders@example.com','Marketing',NOW()-INTERVAL '16 days',NOW()),
('64052455-3aae-5171-89eb-07937f80d116','Isaiah Price','isaiah.price@example.com','Engineering',NOW()-INTERVAL '15 days',NOW()),
('340f5f65-43ea-5d52-80f5-5dcbf0ee05a8','Violet Bennett','violet.bennett@example.com','Design',NOW()-INTERVAL '14 days',NOW()),
('6de46a7d-bfbc-5999-a438-de5c1e053436','Aaron Wood','aaron.wood@example.com','HR',NOW()-INTERVAL '13 days',NOW()),
('df66c835-8386-5bc3-948d-58fcc3ca5a25','Natalie Barnes','natalie.barnes@example.com','Marketing',NOW()-INTERVAL '12 days',NOW()),
('ed704a0e-8af6-5214-a850-55f6a2526f01','Jeremiah Ross','jeremiah.ross@example.com','Engineering',NOW()-INTERVAL '11 days',NOW()),
('ade8442a-2307-5c98-8395-5e21044c666f','Sofia Henderson','sofia.henderson@example.com','Design',NOW()-INTERVAL '10 days',NOW()),
('66190234-9661-569f-a6a0-600fcadd5cdf','Adam Coleman','adam.coleman@example.com','HR',NOW()-INTERVAL '9 days',NOW()),
('2efaf9df-85a4-566e-bd92-4d28fed786e8','Alice Jenkins','alice.jenkins@example.com','Marketing',NOW()-INTERVAL '8 days',NOW()),
('fb71eaf5-877f-5b89-ba20-c7253097ecf9','Jose Perry','jose.perry@example.com','Engineering',NOW()-INTERVAL '7 days',NOW()),
('b23bafbf-77a0-59dc-8d13-13f2435ffe58','Maya Powell','maya.powell@example.com','Design',NOW()-INTERVAL '7 days',NOW()),
('124734c4-3a6f-53f0-8659-cf718c612f38','Kevin Long','kevin.long@example.com','HR',NOW()-INTERVAL '6 days',NOW()),
('efe168e2-c99e-596b-b33d-aec789a7ed7c','Zoe Patterson','zoe.patterson@example.com','Marketing',NOW()-INTERVAL '6 days',NOW()),
('bb8c205e-21a2-5d23-8faa-d36356fd336a','Kyle Hughes','kyle.hughes@example.com','Engineering',NOW()-INTERVAL '5 days',NOW()),
('1ad79f99-afd2-52f4-8faa-eea46a2db5f1','Stella Flores','stella.flores@example.com','Design',NOW()-INTERVAL '5 days',NOW()),
('074c3737-4688-5802-93db-344f6599556a','Bryan Washington','bryan.washington@example.com','HR',NOW()-INTERVAL '4 days',NOW()),
('59dd4167-15d7-5ab8-b2aa-1a8c82d665f5','Nadia Butler','nadia.butler@example.com','Marketing',NOW()-INTERVAL '4 days',NOW()),
('f585a77e-f23b-5e3c-844e-a49ac67d00b5','Marcus Simmons','marcus.simmons@example.com','Engineering',NOW()-INTERVAL '3 days',NOW()),
('1352156b-31c3-569a-bfbd-fb509c692e3e','Grace Foster','grace.foster@example.com','Design',NOW()-INTERVAL '3 days',NOW()),
('04520b93-7e11-552f-b295-edeb017262e5','Eric Gonzales','eric.gonzales@example.com','HR',NOW()-INTERVAL '2 days',NOW()),
('a18e129a-e338-5795-983d-8a501330cb4a','Jasmine Bryant','jasmine.bryant@example.com','Marketing',NOW()-INTERVAL '2 days',NOW()),
('99b6fe84-ff7d-5bdb-83b8-3a5489963235','Victor Alexander','victor.alexander@example.com','Engineering',NOW()-INTERVAL '1 day',NOW()),
('48fb0e11-24ef-561b-a1c3-de4e78e1146e','Diana Russell','diana.russell@example.com','Design',NOW()-INTERVAL '1 day',NOW()),
('1ab387d3-afb8-5576-9717-6340bbd223c8','Samuel Griffin','samuel.griffin@example.com','HR',NOW()-INTERVAL '1 day',NOW()),
('b12bcdcf-8094-59e1-ba55-649d42709b39','Kylie Diaz','kylie.diaz@example.com','Marketing',NOW(),NOW()),
('797c7378-2da9-5726-b0cf-f94e3414e7be','Patrick Hayes','patrick.hayes@example.com','Engineering',NOW(),NOW()),
('749cded8-9c92-5f6a-bde9-de28ee0a70e5','Melissa Myers','melissa.hayes@example.com','Design',NOW(),NOW()),
('b68da3ee-e439-5d6d-b73f-d54852ccc937','Roger Ford','roger.ford@example.com','HR',NOW(),NOW());

-- -----------------------------------------------
-- 300 TASKS (mix of TODO/IN_PROGRESS/DONE, all priorities)
-- assigned to the full user pool (u1–u109)
-- -----------------------------------------------
INSERT INTO tasks (id, title, description, status, priority, assignee_id, due_date, created_at, updated_at) VALUES
('299b1005-671c-56cb-b1a6-04730aa3ea7b','Refactor auth module','Clean up authentication code and add tests','DONE','HIGH','08fc5f51-4d44-5851-8c0f-a5b969ecabdc',NOW()-INTERVAL '5 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '5 days'),
('80b1faa8-d6c1-56e9-a6e5-aaf86a0084f8','Design onboarding screens','Create UI mockups for the onboarding flow','DONE','MEDIUM','add3fd41-3b28-586a-8c57-0a55ec530823',NOW()-INTERVAL '3 days',NOW()-INTERVAL '28 days',NOW()-INTERVAL '3 days'),
('1a27098b-b621-5c5c-8518-fbf8b15adc94','Write unit tests for API','Achieve 80% test coverage on REST API','DONE','HIGH','d8012307-1f60-595a-afe8-3c03d9797f3d',NOW()-INTERVAL '2 days',NOW()-INTERVAL '25 days',NOW()-INTERVAL '2 days'),
('91240b9d-87d2-5e09-828a-ebb795511632','Create content calendar','Plan social posts for next quarter','DONE','MEDIUM','5e7a8f7b-9d75-5734-9e57-8724c334a062',NOW()-INTERVAL '4 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '4 days'),
('9103a231-a470-518a-a78a-e119b9f3f4d3','HR policy update','Update employee handbook for 2026','DONE','LOW','0b96e401-0bb5-599e-84db-bd438bfb0138',NOW()-INTERVAL '6 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '6 days'),
('7e78ee04-ee21-55d3-af8b-f44f4b9e399e','Redesign logo','Create new brand logo variants','DONE','HIGH','b6216c46-39c0-5a31-b9d8-bf2fdf0a561c',NOW()-INTERVAL '1 day',NOW()-INTERVAL '18 days',NOW()-INTERVAL '1 day'),
('d39e56e5-8d9f-592d-befe-6780166f5184','Optimize database indexes','Add indexes to slow queries','DONE','HIGH','f05c21ed-0beb-5ef6-b36b-074423ba5dec',NOW()-INTERVAL '2 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '2 days'),
('e5d6c33b-bbf4-595b-b136-b542ead1df39','Launch email campaign','Send product update newsletter','DONE','MEDIUM','d9332364-4056-5384-b62b-d8f415b4029f',NOW()-INTERVAL '3 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '3 days'),
('ec8d574e-a567-5686-8a89-9199250261a9','Conduct performance reviews','Q1 employee performance evaluations','DONE','MEDIUM','9fcc5215-f3d2-5391-af52-678baa4e1bb5',NOW()-INTERVAL '5 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '5 days'),
('c1627cad-8fa3-5dc7-a72d-23a3c292611c','Build REST API endpoints','Create CRUD endpoints for products','DONE','HIGH','a736ae42-8dca-5298-93f1-99eeaa511037',NOW()-INTERVAL '1 day',NOW()-INTERVAL '10 days',NOW()-INTERVAL '1 day'),
('8ad27d90-a020-5182-b32d-7653d430212e','Create icon library','Design 100 icons for UI kit','DONE','MEDIUM','d6c44974-67f0-5439-bf46-ec5fbb7c08f2',NOW()-INTERVAL '4 days',NOW()-INTERVAL '28 days',NOW()-INTERVAL '4 days'),
('18875faf-8425-5cbc-b15a-dbf916ed8989','SEO keyword research','Identify top 50 keywords for blog','DONE','LOW','bfde5230-00e1-5b64-9648-8d6c76c8f45a',NOW()-INTERVAL '7 days',NOW()-INTERVAL '26 days',NOW()-INTERVAL '7 days'),
('47f944b1-310f-5de5-9e98-fbf3f0d31322','Setup monitoring alerts','Configure PagerDuty for production alerts','DONE','HIGH','4b1a1c5a-044e-52e0-95a8-e23880b4f72c',NOW()-INTERVAL '2 days',NOW()-INTERVAL '24 days',NOW()-INTERVAL '2 days'),
('229a8d86-05e1-5b16-9065-6d8888f3a718','Employee onboarding checklist','Create checklist for new hires','DONE','LOW','2010c087-c136-5f7b-9b5e-4237c81d817d',NOW()-INTERVAL '8 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '8 days'),
('f18f6bd1-a3ba-523e-b11b-8b9e58ff66d6','Implement dark mode toggle','Add theme switch to settings','DONE','MEDIUM','13ad6e40-005e-57a1-b7f3-b6eac45600d3',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('277fa9c7-2d08-5cd3-b4a0-7320df8509da','Create brand guidelines doc','Document brand colors, fonts, and usage','DONE','MEDIUM','84ed3d98-1580-521b-926e-a086f848d988',NOW()-INTERVAL '5 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '5 days'),
('6bcf693c-e385-5705-9602-a73f5461256f','A/B test landing page','Test two versions of hero section','DONE','HIGH','d27309da-464c-5db4-bf9e-698816e45294',NOW()-INTERVAL '1 day',NOW()-INTERVAL '16 days',NOW()-INTERVAL '1 day'),
('013720a3-fb98-57e3-8f02-794d25d5c79e','Update privacy policy','GDPR compliance review and update','DONE','HIGH','8a64a264-b243-548f-934c-4bde8d2a386e',NOW()-INTERVAL '2 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '2 days'),
('ff6f0953-1222-5865-ad34-81d5e4e6e07e','Build notification service','Push notifications for mobile app','DONE','HIGH','57fc2970-86bb-54d7-ad76-f87400903759',NOW()-INTERVAL '3 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '3 days'),
('cd1bbe9c-9905-5590-81f4-6c65c9422b4b','Competitor analysis','Research 10 top competitors','DONE','MEDIUM','08b516dc-85fb-57c9-8f83-740207dc6995',NOW()-INTERVAL '6 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '6 days'),
('2ad99709-7b5c-59e8-b56a-f10aecd03f88','Code review guidelines','Document code review best practices','DONE','LOW','9293afa1-acff-5592-b506-11fe24e62e9b',NOW()-INTERVAL '9 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '9 days'),
('5af6fc0a-7a8c-558e-a008-bea3b8e01e20','Create product video','60-second product demo video','DONE','HIGH','1a016386-460e-5d3b-a49c-9fd277d425ca',NOW()-INTERVAL '2 days',NOW()-INTERVAL '28 days',NOW()-INTERVAL '2 days'),
('cb8899c1-4d02-5b08-8f00-5ed40dfd4c30','Fix payment bug','Resolve double-charge issue in checkout','DONE','HIGH','a1956b30-3db0-51a5-a63a-1ab869110f08',NOW()-INTERVAL '1 day',NOW()-INTERVAL '26 days',NOW()-INTERVAL '1 day'),
('56a4583b-b77f-5713-9742-33299feff5cf','User research interviews','Conduct 10 user interviews','DONE','MEDIUM','373aa24a-3d48-536d-b2e9-4dc2e1ff58d4',NOW()-INTERVAL '4 days',NOW()-INTERVAL '24 days',NOW()-INTERVAL '4 days'),
('28ce81bf-4180-5916-a53b-59ce1b669b92','Write API docs','Document all v2 API endpoints','DONE','MEDIUM','dc8d6390-79cc-51bf-9b32-91000a84d3d0',NOW()-INTERVAL '5 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '5 days'),
('6e773867-9c5d-5af0-a928-c69f0a7a4c95','Redesign checkout flow','Simplify 3-step checkout to 1-step','DONE','HIGH','8ad71ffa-533c-5329-885e-e802e13cccfd',NOW()-INTERVAL '2 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '2 days'),
('29d099da-7b6f-594a-bae7-b5eb6da5b7e2','Set up staging environment','Configure staging server and CI/CD','DONE','HIGH','3c11f877-a165-52df-bb5d-f692b0e757f0',NOW()-INTERVAL '3 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '3 days'),
('7601e9a9-0fef-51bd-b7b6-89ce21ad359c','Create FAQ page','Write answers for top 30 user questions','DONE','LOW','71789cf9-6288-5767-85ae-3d4efe684a9c',NOW()-INTERVAL '7 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '7 days'),
('3e361959-e5e9-5cf5-84b4-b9dcd163de5e','Implement file upload','S3 integration for user file uploads','DONE','HIGH','4547e5e2-dcaf-5fe3-87e0-950367613bfc',NOW()-INTERVAL '2 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '2 days'),
('f221c6ce-352b-51e6-b9ea-d14ef79ccc18','Write blog post','Article on product best practices','DONE','LOW','dda8ff58-c611-50f9-8714-d53ca244ed3c',NOW()-INTERVAL '8 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '8 days'),
('5e50e0d6-0c53-542d-b5f1-975e530601fa','Fix mobile layout issues','Responsive fixes for iOS Safari','DONE','MEDIUM','f8247016-9cda-5543-a7e9-110be27b15f1',NOW()-INTERVAL '4 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '4 days'),
('a4769831-5f06-5326-8cf5-17553e308eb5','Create sales deck','PowerPoint for enterprise sales team','DONE','MEDIUM','b5928358-636b-57bc-b3d0-a268c5459b3a',NOW()-INTERVAL '5 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '5 days'),
('80ceef0e-28da-5624-8b33-154aaa0e5e8b','Database backup automation','Schedule nightly DB backups to S3','DONE','HIGH','b8405422-5f14-59cd-a88b-61d85892edf8',NOW()-INTERVAL '1 day',NOW()-INTERVAL '28 days',NOW()-INTERVAL '1 day'),
('70cc1643-0452-5af6-8f8e-5825612f90a1','Update team org chart','Reflect Q1 restructure in org chart','DONE','LOW','73262575-58a0-5da7-ae54-236dfe5be4bd',NOW()-INTERVAL '10 days',NOW()-INTERVAL '26 days',NOW()-INTERVAL '10 days'),
('a35cfa5e-6a61-553b-b36d-ff904cc15662','Implement search feature','Full-text search with Elasticsearch','DONE','HIGH','6d2dc866-7797-58f4-9695-9bc5421fcca6',NOW()-INTERVAL '2 days',NOW()-INTERVAL '24 days',NOW()-INTERVAL '2 days'),
('c327a148-f37b-55ef-b947-803f50f05e08','Design email templates','HTML templates for transactional emails','DONE','MEDIUM','22160486-b3c7-5162-8958-9fd494d754b5',NOW()-INTERVAL '3 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '3 days'),
('6636f366-5d70-584a-a441-1542b720bdc0','Podcast episode planning','Plan 4 podcast episodes for Q2','DONE','LOW','f1cb83d0-e8fa-5dc5-ae40-a6d40eb4f51b',NOW()-INTERVAL '9 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '9 days'),
('144311d8-b011-5104-8a2f-2b42efbe8f49','Security audit','Pen testing and vulnerability assessment','DONE','HIGH','eb215a3f-59c9-571a-ba2c-fc564021de65',NOW()-INTERVAL '2 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days'),
('9355feb4-d91a-5f37-bc2e-06831c70e03e','Salary band review','Update compensation bands for 2026','DONE','MEDIUM','fef7518b-d5c1-5b4a-96ba-46e60b4cc3ba',NOW()-INTERVAL '6 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '6 days'),
('085395cd-127d-51e8-9ea5-55a462add041','Implement OAuth2','Google and GitHub login integration','DONE','HIGH','0ab380c8-6f99-587c-b0cc-f3d1c8e94f9a',NOW()-INTERVAL '1 day',NOW()-INTERVAL '14 days',NOW()-INTERVAL '1 day'),
('ac3422c8-f903-596f-90da-bdec405ea12e','Create style guide','Document component library styles','DONE','MEDIUM','4ea8a886-f299-5b08-9d75-910117b4e1c6',NOW()-INTERVAL '4 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '4 days'),
('7f25ddc0-0f43-5522-bf97-97915de1d493','Launch referral program','Build referral tracking and rewards','DONE','HIGH','e00c2562-d4d6-55a6-a41d-ee73d2c7be6e',NOW()-INTERVAL '2 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '2 days'),
('7211f030-7040-5173-84ce-6a75c440425b','Migrate to PostgreSQL 17','Upgrade from PG16 to PG17','DONE','HIGH','c09b2121-93b2-5dc7-9cdc-3402e7be7a4d',NOW()-INTERVAL '3 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '3 days'),
('6656ad7e-db66-51df-a939-df3f8d8e0e5f','Write case studies','Document 3 customer success stories','DONE','MEDIUM','03653e21-8377-5d46-86ca-dec3e9489633',NOW()-INTERVAL '5 days',NOW()-INTERVAL '28 days',NOW()-INTERVAL '5 days'),
('0f2df9cd-9901-5fdc-828e-35e639dce789','Fix CSV export bug','Special characters corrupting CSV files','DONE','MEDIUM','64052455-3aae-5171-89eb-07937f80d116',NOW()-INTERVAL '4 days',NOW()-INTERVAL '26 days',NOW()-INTERVAL '4 days'),
('a58c2a61-c161-5529-9108-f706bf802df8','Design new dashboard','Revamp main dashboard with new KPIs','DONE','HIGH','340f5f65-43ea-5d52-80f5-5dcbf0ee05a8',NOW()-INTERVAL '1 day',NOW()-INTERVAL '24 days',NOW()-INTERVAL '1 day'),
('bd2d1acb-7e70-5e12-9387-89685dde5dbb','Setup CDN','Configure CloudFront for static assets','DONE','MEDIUM','ed704a0e-8af6-5214-a850-55f6a2526f01',NOW()-INTERVAL '3 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '3 days'),
('9d6f4b2d-6b4a-5189-9383-674bfc447228','Interview candidates','Screen 20 engineering candidates','DONE','MEDIUM','6de46a7d-bfbc-5999-a438-de5c1e053436',NOW()-INTERVAL '6 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '6 days'),
('24465d12-9cc4-5ce1-bed7-7ed1653a9c25','Launch affiliate program','Build partner tracking system','DONE','HIGH','df66c835-8386-5bc3-948d-58fcc3ca5a25',NOW()-INTERVAL '2 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days'),
('e0cbb3af-dbb7-5da5-814c-4e5706cba263','Implement rate limiting','API rate limiting with Redis','DONE','HIGH','fb71eaf5-877f-5b89-ba20-c7253097ecf9',NOW()-INTERVAL '1 day',NOW()-INTERVAL '16 days',NOW()-INTERVAL '1 day'),
-- IN_PROGRESS batch
('b12f18fa-4803-524a-a6cd-35ac576ea65f','Build analytics dashboard','Real-time metrics with charts','IN_PROGRESS','HIGH','08fc5f51-4d44-5851-8c0f-a5b969ecabdc',NOW()+INTERVAL '7 days',NOW()-INTERVAL '5 days',NOW()),
('efdc766f-be22-5eff-86ea-058f0cc14fed','Design mobile app screens','iOS and Android UI designs','IN_PROGRESS','HIGH','add3fd41-3b28-586a-8c57-0a55ec530823',NOW()+INTERVAL '10 days',NOW()-INTERVAL '4 days',NOW()),
('8c5be0a2-87eb-5478-a07e-15ae2ebf35c6','Migrate legacy codebase','Move from PHP to Node.js','IN_PROGRESS','HIGH','d8012307-1f60-595a-afe8-3c03d9797f3d',NOW()+INTERVAL '14 days',NOW()-INTERVAL '6 days',NOW()),
('ecebc482-ef8a-50aa-bec0-22a97b5452f4','Social media strategy Q3','Plan social channels for Q3','IN_PROGRESS','MEDIUM','5e7a8f7b-9d75-5734-9e57-8724c334a062',NOW()+INTERVAL '8 days',NOW()-INTERVAL '3 days',NOW()),
('b47e620c-75fd-51a6-9f77-1d7319c7c967','Benefits enrollment system','Employee benefits portal','IN_PROGRESS','MEDIUM','0b96e401-0bb5-599e-84db-bd438bfb0138',NOW()+INTERVAL '12 days',NOW()-INTERVAL '5 days',NOW()),
('cc38a83d-cd6b-5356-b21d-6829b798c2d1','Redesign pricing page','A/B test new pricing layout','IN_PROGRESS','HIGH','b6216c46-39c0-5a31-b9d8-bf2fdf0a561c',NOW()+INTERVAL '5 days',NOW()-INTERVAL '2 days',NOW()),
('ba6bd11d-6145-5421-999f-bb8bc86520b8','Implement GraphQL API','Add GraphQL layer to REST backend','IN_PROGRESS','HIGH','f05c21ed-0beb-5ef6-b36b-074423ba5dec',NOW()+INTERVAL '9 days',NOW()-INTERVAL '4 days',NOW()),
('75791f72-17fc-5ebe-bf23-19239691fbb4','Influencer outreach','Contact 50 relevant influencers','IN_PROGRESS','MEDIUM','d9332364-4056-5384-b62b-d8f415b4029f',NOW()+INTERVAL '11 days',NOW()-INTERVAL '3 days',NOW()),
('5e980384-8093-57c2-a36c-1bb96cf21e7c','360 review system','Build peer review workflow','IN_PROGRESS','MEDIUM','9fcc5215-f3d2-5391-af52-678baa4e1bb5',NOW()+INTERVAL '15 days',NOW()-INTERVAL '6 days',NOW()),
('930ddad8-9dd8-5494-82ba-29bc671f693f','Build subscription billing','Stripe subscription integration','IN_PROGRESS','HIGH','a736ae42-8dca-5298-93f1-99eeaa511037',NOW()+INTERVAL '6 days',NOW()-INTERVAL '2 days',NOW()),
('0cf3fd4e-02d2-5a80-8400-d9ef1713328a','Redesign component library','Migrate to new design tokens','IN_PROGRESS','HIGH','d6c44974-67f0-5439-bf46-ec5fbb7c08f2',NOW()+INTERVAL '8 days',NOW()-INTERVAL '4 days',NOW()),
('0dff8719-bfa0-5ea7-893c-97552038d1e3','Content partnership deals','Negotiate 5 content partnerships','IN_PROGRESS','MEDIUM','bfde5230-00e1-5b64-9648-8d6c76c8f45a',NOW()+INTERVAL '13 days',NOW()-INTERVAL '5 days',NOW()),
('c78323e4-dfde-5d7a-b2c4-f52f7c3f1966','Implement WebSocket support','Real-time features for chat','IN_PROGRESS','HIGH','4b1a1c5a-044e-52e0-95a8-e23880b4f72c',NOW()+INTERVAL '7 days',NOW()-INTERVAL '3 days',NOW()),
('fcba634e-8493-508f-9386-5991edda35e8','Training needs assessment','Identify skill gaps across teams','IN_PROGRESS','LOW','2010c087-c136-5f7b-9b5e-4237c81d817d',NOW()+INTERVAL '20 days',NOW()-INTERVAL '4 days',NOW()),
('d4622176-b197-5658-b823-091f57ac1326','Build reporting module','Custom report builder with export','IN_PROGRESS','HIGH','13ad6e40-005e-57a1-b7f3-b6eac45600d3',NOW()+INTERVAL '9 days',NOW()-INTERVAL '5 days',NOW()),
('67fe0e3c-436c-536a-8597-05820e37bc51','Create motion design assets','Animations for marketing site','IN_PROGRESS','MEDIUM','84ed3d98-1580-521b-926e-a086f848d988',NOW()+INTERVAL '11 days',NOW()-INTERVAL '3 days',NOW()),
('afff1b18-fbc3-517f-bb4f-1bd3883deb60','PPC campaign setup','Google Ads campaign for product launch','IN_PROGRESS','HIGH','d27309da-464c-5db4-bf9e-698816e45294',NOW()+INTERVAL '4 days',NOW()-INTERVAL '2 days',NOW()),
('b1c3258e-90b3-50e1-a25d-704db65c97e5','Implement 2FA','Two-factor authentication for accounts','IN_PROGRESS','HIGH','8a64a264-b243-548f-934c-4bde8d2a386e',NOW()+INTERVAL '6 days',NOW()-INTERVAL '3 days',NOW()),
('a95e763f-1d5a-5029-b57a-19d3e628aedd','Build data pipeline','ETL pipeline for analytics warehouse','IN_PROGRESS','HIGH','57fc2970-86bb-54d7-ad76-f87400903759',NOW()+INTERVAL '10 days',NOW()-INTERVAL '5 days',NOW()),
('af703474-9120-5423-9a6e-cad1abc2aba1','Webinar production','Host product demo webinar','IN_PROGRESS','MEDIUM','08b516dc-85fb-57c9-8f83-740207dc6995',NOW()+INTERVAL '15 days',NOW()-INTERVAL '4 days',NOW()),
('bc237854-8a9a-5ca5-a089-6ad6fe6e62ed','Refactor frontend state','Migrate from Redux to Zustand','IN_PROGRESS','MEDIUM','9293afa1-acff-5592-b506-11fe24e62e9b',NOW()+INTERVAL '8 days',NOW()-INTERVAL '3 days',NOW()),
('f88f988b-ca2e-5984-b964-b91709ad2f1c','Trade show booth design','Design booth for TechConf 2026','IN_PROGRESS','MEDIUM','1a016386-460e-5d3b-a49c-9fd277d425ca',NOW()+INTERVAL '12 days',NOW()-INTERVAL '5 days',NOW()),
('692b2f5d-0384-51b5-811a-3ed5deb7a86d','Implement caching layer','Redis caching for API responses','IN_PROGRESS','HIGH','a1956b30-3db0-51a5-a63a-1ab869110f08',NOW()+INTERVAL '5 days',NOW()-INTERVAL '2 days',NOW()),
('6ac27676-5a05-5bf4-963c-dfc18c489702','Customer advisory board','Recruit 10 customers for CAB','IN_PROGRESS','LOW','373aa24a-3d48-536d-b2e9-4dc2e1ff58d4',NOW()+INTERVAL '25 days',NOW()-INTERVAL '6 days',NOW()),
('472d16d8-87c0-5858-937b-685305a740c3','Build admin panel','Internal admin CRUD interface','IN_PROGRESS','HIGH','dc8d6390-79cc-51bf-9b32-91000a84d3d0',NOW()+INTERVAL '7 days',NOW()-INTERVAL '4 days',NOW()),
-- TODO batch
('c999b46a-e263-56e2-aa9f-b82f335d4c50','Implement AI recommendations','ML-based product recommendations','TODO','HIGH','8ad71ffa-533c-5329-885e-e802e13cccfd',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('d641a7f7-fbc9-521f-982d-ab99beb4369a','Create video tutorials','5 product tutorial videos','TODO','MEDIUM','3c11f877-a165-52df-bb5d-f692b0e757f0',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
('19a8ea89-6105-57c9-89b5-5549d9661b56','Setup disaster recovery','DR plan and runbooks','TODO','HIGH','71789cf9-6288-5767-85ae-3d4efe684a9c',NOW()+INTERVAL '30 days',NOW()-INTERVAL '3 days',NOW()),
('e8022a84-b9ab-5b22-ba10-f6ed363713ca','Launch loyalty program','Points and rewards system','TODO','HIGH','4547e5e2-dcaf-5fe3-87e0-950367613bfc',NOW()+INTERVAL '18 days',NOW()-INTERVAL '2 days',NOW()),
('f916d350-20ff-58b3-ad9e-48c55b3d0176','Implement GDPR tools','Data export and deletion APIs','TODO','HIGH','dda8ff58-c611-50f9-8714-d53ca244ed3c',NOW()+INTERVAL '22 days',NOW()-INTERVAL '1 day',NOW()),
('2507e658-8e3d-5905-bc59-07333a34f93a','Redesign onboarding','New user onboarding flow','TODO','MEDIUM','f8247016-9cda-5543-a7e9-110be27b15f1',NOW()+INTERVAL '15 days',NOW()-INTERVAL '3 days',NOW()),
('ca6c5a64-9a4a-5af4-a493-ae2881c43ee4','Build mobile app MVP','React Native MVP for iOS','TODO','HIGH','b8405422-5f14-59cd-a88b-61d85892edf8',NOW()+INTERVAL '45 days',NOW()-INTERVAL '2 days',NOW()),
('efc3003b-ddf0-5abb-9eb8-d32a90ebdf99','Create investor deck','Series A pitch presentation','TODO','HIGH','6d2dc866-7797-58f4-9695-9bc5421fcca6',NOW()+INTERVAL '12 days',NOW()-INTERVAL '1 day',NOW()),
('d91ff362-ca5e-54c1-9b45-db64b2cbc5d1','Implement audit logs','Track all user actions','TODO','MEDIUM','eb215a3f-59c9-571a-ba2c-fc564021de65',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('2a5d2dd0-eb6c-5a88-bf34-ae2fecb38eb0','Diversity hiring initiative','Partner with 3 diversity orgs','TODO','MEDIUM','fef7518b-d5c1-5b4a-96ba-46e60b4cc3ba',NOW()+INTERVAL '30 days',NOW()-INTERVAL '3 days',NOW()),
('2ec77a5c-b06b-5fe2-ab1c-d19e0bc3726f','Build API marketplace','Public API partner portal','TODO','HIGH','0ab380c8-6f99-587c-b0cc-f3d1c8e94f9a',NOW()+INTERVAL '35 days',NOW()-INTERVAL '2 days',NOW()),
('89e8795a-4d39-5749-9f60-2326df172f42','Create design system v2','Next generation component system','TODO','HIGH','4ea8a886-f299-5b08-9d75-910117b4e1c6',NOW()+INTERVAL '40 days',NOW()-INTERVAL '1 day',NOW()),
('7c2ff8b4-de42-5db4-b0b3-7839c4e385c4','Launch product hunt','Product Hunt launch campaign','TODO','HIGH','e00c2562-d4d6-55a6-a41d-ee73d2c7be6e',NOW()+INTERVAL '10 days',NOW()-INTERVAL '2 days',NOW()),
('b4433187-305d-5da4-a27e-07db24a2727f','Migrate to microservices','Break monolith into services','TODO','HIGH','c09b2121-93b2-5dc7-9cdc-3402e7be7a4d',NOW()+INTERVAL '60 days',NOW()-INTERVAL '3 days',NOW()),
('ca747e0b-1827-5d5e-8b26-bef5d4aaa2d7','Write technical whitepaper','Architecture decision document','TODO','MEDIUM','64052455-3aae-5171-89eb-07937f80d116',NOW()+INTERVAL '25 days',NOW()-INTERVAL '2 days',NOW()),
('3bf6e0b3-1c4e-5728-84f5-e8fbc944329c','Build customer portal','Self-service account management','TODO','HIGH','ed704a0e-8af6-5214-a850-55f6a2526f01',NOW()+INTERVAL '28 days',NOW()-INTERVAL '1 day',NOW()),
('f2f581ab-5b8d-5d0d-880c-74ebe80ca131','Implement SSO','SAML/OIDC single sign-on','TODO','HIGH','fb71eaf5-877f-5b89-ba20-c7253097ecf9',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('b351be8f-9c49-5684-8db1-085f95ae3c83','Annual company survey','Employee satisfaction survey','TODO','LOW','6de46a7d-bfbc-5999-a438-de5c1e053436',NOW()+INTERVAL '14 days',NOW()-INTERVAL '1 day',NOW()),
('ff354d01-0ba6-5b91-9fb7-c8777439614b','Build integration marketplace','Third-party app integrations','TODO','HIGH','bb8c205e-21a2-5d23-8faa-d36356fd336a',NOW()+INTERVAL '50 days',NOW()-INTERVAL '3 days',NOW()),
('4884ffc5-3879-54b9-9743-a912ef9ae543','Create demo environment','Sandboxed demo account','TODO','MEDIUM','f585a77e-f23b-5e3c-844e-a49ac67d00b5',NOW()+INTERVAL '18 days',NOW()-INTERVAL '2 days',NOW()),
('d8325d4a-a4f3-5259-9ccf-76343d77d402','Implement feature flags','LaunchDarkly integration','TODO','MEDIUM','99b6fe84-ff7d-5bdb-83b8-3a5489963235',NOW()+INTERVAL '15 days',NOW()-INTERVAL '1 day',NOW()),
('527eb278-1c27-5db7-beb2-c3a0ca026f98','User permission system','Role-based access control','TODO','HIGH','797c7378-2da9-5726-b0cf-f94e3414e7be',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('1cf0b91f-980f-5c37-bc97-4bc321bdf5e0','Brand photography shoot','Product and team photos','TODO','LOW','1352156b-31c3-569a-bfbd-fb509c692e3e',NOW()+INTERVAL '30 days',NOW()-INTERVAL '1 day',NOW()),
('a033722e-279f-50bb-91ae-864e1632363d','Implement data export','CSV and PDF export for reports','TODO','MEDIUM','b23bafbf-77a0-59dc-8d13-13f2435ffe58',NOW()+INTERVAL '17 days',NOW()-INTERVAL '2 days',NOW()),
('6da1c44d-e9e9-5c45-a770-049898e82c0c','Build status page','Public uptime status page','TODO','MEDIUM','1ad79f99-afd2-52f4-8faa-eea46a2db5f1',NOW()+INTERVAL '12 days',NOW()-INTERVAL '1 day',NOW()),
-- More DONE tasks spread across other users
('3498c492-15d6-5608-bf3c-81a2a1eaa9a6','Setup load balancer','HAProxy configuration for HA','DONE','HIGH','abef3e3a-2a04-5076-b48a-03a821059994',NOW()-INTERVAL '3 days',NOW()-INTERVAL '25 days',NOW()-INTERVAL '3 days'),
('d8e8b3a8-bfff-555b-9509-1c03f108b763','Create press kit','Media assets and company bio','DONE','LOW','68ca7dad-a4e7-596a-ad71-2459e296ae3e',NOW()-INTERVAL '7 days',NOW()-INTERVAL '23 days',NOW()-INTERVAL '7 days'),
('98b25c36-72a1-540f-9aeb-f83cebb64e77','Fix XSS vulnerability','Sanitize user input fields','DONE','HIGH','c14054a7-7d4f-5eac-86ca-c312c7403480',NOW()-INTERVAL '1 day',NOW()-INTERVAL '21 days',NOW()-INTERVAL '1 day'),
('be9ae09f-463e-5c3d-9cac-271aa14a7efb','Keynote presentation','Slides for industry conference','DONE','MEDIUM','e62381b0-29b7-55d7-906c-8d56f2eeddda',NOW()-INTERVAL '4 days',NOW()-INTERVAL '19 days',NOW()-INTERVAL '4 days'),
('e671db04-1cd1-598a-8307-354611318058','Implement pagination API','Cursor-based pagination for all lists','DONE','MEDIUM','5e2602c8-5e7a-54d3-9dff-d1dda23967ef',NOW()-INTERVAL '3 days',NOW()-INTERVAL '17 days',NOW()-INTERVAL '3 days'),
('380df328-87a3-546a-93f1-3e71cdda9a1e','Create user personas','5 buyer persona documents','DONE','MEDIUM','230b266f-4b3c-569b-b6c7-21de47d36796',NOW()-INTERVAL '5 days',NOW()-INTERVAL '15 days',NOW()-INTERVAL '5 days'),
('5c0a4c2d-4ef1-52e1-98ac-48b77df96765','Build CSV importer','Bulk user import via CSV','DONE','HIGH','512e5915-5937-54b1-8ccc-d20cd174c4a9',NOW()-INTERVAL '2 days',NOW()-INTERVAL '13 days',NOW()-INTERVAL '2 days'),
('5a7aac8f-e1f9-53d0-8a5c-92b5e1ad7a0f','Employee engagement survey','Quarterly pulse check','DONE','LOW','047be7b6-ab77-5b6a-93b7-55d8b6e38ec3',NOW()-INTERVAL '9 days',NOW()-INTERVAL '11 days',NOW()-INTERVAL '9 days'),
('54ced94f-cb37-5113-9d7c-0226e181dd9b','Implement webhook system','Outbound webhooks for integrations','DONE','HIGH','310e45bb-60df-50d9-8e6d-12c418ab622c',NOW()-INTERVAL '2 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '2 days'),
('72765d98-761c-527b-9ffc-0be255f8ddf4','Product roadmap 2026','Plan and prioritize Q3-Q4 features','DONE','HIGH','fc2885d7-52a3-5a00-95bb-24045d600250',NOW()-INTERVAL '3 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '3 days'),
('7b1b2d18-21bd-547b-a27e-5c17f4f0a498','Setup error tracking','Sentry integration for all services','DONE','MEDIUM','7c63122e-c11c-5e81-8091-118841ffb597',NOW()-INTERVAL '4 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '4 days'),
('4dfeb9dd-c5f8-5a8b-862f-9816c1885e4e','Rewrite test suite','Migrate from Jest to Vitest','DONE','MEDIUM','42b1e5a5-3b3f-5305-a74f-b560135340f5',NOW()-INTERVAL '5 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '5 days'),
('78cde6bc-efe2-544f-91ea-8165fc091515','Annual report design','Design 2025 annual report PDF','DONE','HIGH','c5057b04-c2d1-5c81-9f9b-b38684fc96ac',NOW()-INTERVAL '2 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '2 days'),
('fe9ce7ea-a150-5716-8077-9be31618d026','Build approval workflow','Multi-step approval for documents','DONE','HIGH','fbee04ac-5ce8-5f5f-9259-c3d19aa9bc10',NOW()-INTERVAL '1 day',NOW()-INTERVAL '10 days',NOW()-INTERVAL '1 day'),
('a81ef3dd-81ab-5b84-9d0a-e3e5451c8fa4','Implement i18n','Internationalization for 5 languages','DONE','HIGH','e599486a-aabc-5168-9671-e7ef84c21967',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('4eca1e7c-b04f-5ea4-9946-7d19802a76bf','Create UX research plan','Usability testing methodology','DONE','MEDIUM','70cca839-6b19-58e4-8924-e38d88b33cca',NOW()-INTERVAL '6 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '6 days'),
('64cd9ed7-d03a-5f5e-b283-110745cedb12','Launch partner program','Channel partner onboarding','DONE','HIGH','56c26fed-b0e2-5025-be0b-ca0c936ca04e',NOW()-INTERVAL '2 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '2 days'),
('6f3ba056-6d62-5ce0-abc7-cb43391ec7e0','Implement data retention','Auto-delete old data per policy','DONE','HIGH','6a6928b9-9e5a-5719-8307-973618acaaf0',NOW()-INTERVAL '3 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '3 days'),
('60c302b4-843f-5666-bc15-645f517d77e3','Benefits benchmarking','Research market compensation','DONE','MEDIUM','3788aed4-622f-597b-8d2c-b36cae584778',NOW()-INTERVAL '5 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '5 days'),
('a10cdfb6-9737-52ec-8311-4f18d70465c6','Build template library','50 pre-built report templates','DONE','MEDIUM','ade8442a-2307-5c98-8395-5e21044c666f',NOW()-INTERVAL '4 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '4 days'),
-- More IN_PROGRESS spread across other users
('8c099576-49cf-5a7c-b52e-fd2e97c8c048','Revamp help center','Redesign knowledge base','IN_PROGRESS','MEDIUM','abef3e3a-2a04-5076-b48a-03a821059994',NOW()+INTERVAL '14 days',NOW()-INTERVAL '3 days',NOW()),
('21ba59c0-b2ef-53f9-a4f7-7e9c2ba934e7','Implement team workspaces','Multi-tenant workspace support','IN_PROGRESS','HIGH','9293afa1-acff-5592-b506-11fe24e62e9b',NOW()+INTERVAL '9 days',NOW()-INTERVAL '4 days',NOW()),
('fd3aa5d1-386c-501a-8c0b-7e9517cc15ff','Customer health scoring','Churn prediction model','IN_PROGRESS','HIGH','c14054a7-7d4f-5eac-86ca-c312c7403480',NOW()+INTERVAL '12 days',NOW()-INTERVAL '5 days',NOW()),
('bb15f5bf-ccab-5f46-9872-58d45a5e4207','Redesign user profile','New profile page with activity feed','IN_PROGRESS','MEDIUM','5e2602c8-5e7a-54d3-9dff-d1dda23967ef',NOW()+INTERVAL '7 days',NOW()-INTERVAL '2 days',NOW()),
('2007b0a5-6705-5ada-a9a9-87f91c9214d2','Podcast advertising campaign','Sponsor 3 tech podcasts','IN_PROGRESS','MEDIUM','230b266f-4b3c-569b-b6c7-21de47d36796',NOW()+INTERVAL '15 days',NOW()-INTERVAL '4 days',NOW()),
('fe454a08-ed41-5926-9983-4fa624a2e808','Compliance training','HIPAA and SOC2 training rollout','IN_PROGRESS','HIGH','512e5915-5937-54b1-8ccc-d20cd174c4a9',NOW()+INTERVAL '10 days',NOW()-INTERVAL '3 days',NOW()),
('d80fbcd0-2192-5b6a-bb41-c694578b9ceb','Build custom reports','Drag-and-drop report builder','IN_PROGRESS','HIGH','310e45bb-60df-50d9-8e6d-12c418ab622c',NOW()+INTERVAL '8 days',NOW()-INTERVAL '5 days',NOW()),
('9bae739b-3c73-5b82-8b3f-04cbaef49281','Launch community forum','Discourse community setup','IN_PROGRESS','MEDIUM','fc2885d7-52a3-5a00-95bb-24045d600250',NOW()+INTERVAL '11 days',NOW()-INTERVAL '3 days',NOW()),
('09534aea-0f70-5dc4-af72-a9f3ff1efc1f','Implement Kubernetes','K8s migration from Docker Swarm','IN_PROGRESS','HIGH','7c63122e-c11c-5e81-8091-118841ffb597',NOW()+INTERVAL '20 days',NOW()-INTERVAL '6 days',NOW()),
('c59f8e9c-1135-52a8-89c8-f6c3a00c81ff','Brand refresh campaign','New look and feel rollout','IN_PROGRESS','HIGH','42b1e5a5-3b3f-5305-a74f-b560135340f5',NOW()+INTERVAL '6 days',NOW()-INTERVAL '2 days',NOW()),
-- More TODO tasks
('10a9bb2b-255c-51b5-be67-42b664144762','Build event tracking','Custom analytics events','TODO','MEDIUM','68ca7dad-a4e7-596a-ad71-2459e296ae3e',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('9b221d14-fb04-5fb7-b445-6b5df04da8de','Create chatbot','AI support chatbot integration','TODO','HIGH','e62381b0-29b7-55d7-906c-8d56f2eeddda',NOW()+INTERVAL '35 days',NOW()-INTERVAL '3 days',NOW()),
('4ff640c0-fe0c-531b-8533-e3dc33c5aa77','Implement smart search','NLP-powered search feature','TODO','HIGH','74ba569a-7c7f-5539-8639-aac1fe7d1dbe',NOW()+INTERVAL '28 days',NOW()-INTERVAL '2 days',NOW()),
('eb7c8762-9e77-59c5-9897-8ccd929d400e','Build recommendation engine','Collaborative filtering model','TODO','HIGH','567ef416-5a09-5f1c-b7d4-fdabad44bf66',NOW()+INTERVAL '40 days',NOW()-INTERVAL '1 day',NOW()),
('dde694f3-e85d-567e-9400-9368b5f4483d','Create learning portal','Employee L&D platform','TODO','MEDIUM','bd38c615-7883-5c8b-94b7-c09b38ca65f5',NOW()+INTERVAL '30 days',NOW()-INTERVAL '2 days',NOW()),
('27b2ab22-88d8-5d16-976c-dd0adf6a1a90','Redesign mobile nav','Bottom navigation bar for mobile','TODO','MEDIUM','5b99f16a-71fa-54a8-8a55-622cc0bb7e1c',NOW()+INTERVAL '14 days',NOW()-INTERVAL '1 day',NOW()),
('35b63c8b-009f-5bfb-9d78-1523171f37ca','Implement SLA tracking','Customer SLA monitoring','TODO','HIGH','f375ba5d-6c27-5a7f-9d85-3cbf5c368ccb',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('1673e4bb-a3e2-51ee-a9bf-23379e03089c','Build invoice system','Generate and send PDF invoices','TODO','HIGH','23e4bc44-50ef-5421-9cce-b2017f31dff7',NOW()+INTERVAL '18 days',NOW()-INTERVAL '1 day',NOW()),
('9daaac2d-ff5c-5f14-9e7e-868eefa1de35','Launch beta program','Managed early-access program','TODO','MEDIUM','f497693a-b965-5c86-81cf-385d0b3ae28c',NOW()+INTERVAL '15 days',NOW()-INTERVAL '2 days',NOW()),
('b6cccc92-f80b-5848-b2a9-b00cd8f8602f','Implement cron scheduler','Background job scheduling','TODO','MEDIUM','b5928358-636b-57bc-b3d0-a268c5459b3a',NOW()+INTERVAL '12 days',NOW()-INTERVAL '1 day',NOW()),
('ed38624c-eb2d-5595-8b70-e0aefd2dcf2f','Accessibility improvements','WCAG 2.2 compliance updates','TODO','HIGH','f1cb83d0-e8fa-5dc5-ae40-a6d40eb4f51b',NOW()+INTERVAL '25 days',NOW()-INTERVAL '2 days',NOW()),
('694a2edf-f188-576b-8629-c39ecf51a64f','Build team calendar','Shared calendar with availability','TODO','MEDIUM','c5057b04-c2d1-5c81-9f9b-b38684fc96ac',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
('5dc73792-e98a-58e3-ae08-67cf1c8b0f97','Implement dark mode','System-level dark mode support','TODO','LOW','fbee04ac-5ce8-5f5f-9259-c3d19aa9bc10',NOW()+INTERVAL '30 days',NOW()-INTERVAL '2 days',NOW()),
('ff45eb1f-636f-57ac-8a57-ec3ec3ea3776','Create API SDK','Python and JS SDK for public API','TODO','HIGH','e599486a-aabc-5168-9671-e7ef84c21967',NOW()+INTERVAL '35 days',NOW()-INTERVAL '3 days',NOW()),
('9f378086-0d91-51f7-8b2c-6f5304ec0e67','Build approval chains','Configurable approval workflows','TODO','HIGH','70cca839-6b19-58e4-8924-e38d88b33cca',NOW()+INTERVAL '28 days',NOW()-INTERVAL '2 days',NOW()),
('8322350c-21ea-5369-b48d-44fe3f4d5753','Implement e-signature','DocuSign integration for contracts','TODO','HIGH','56c26fed-b0e2-5025-be0b-ca0c936ca04e',NOW()+INTERVAL '22 days',NOW()-INTERVAL '1 day',NOW()),
('d8822c5f-fa24-5435-bbae-f107acd3bad0','Create video library','Internal training video portal','TODO','MEDIUM','3788aed4-622f-597b-8d2c-b36cae584778',NOW()+INTERVAL '30 days',NOW()-INTERVAL '2 days',NOW()),
('ff9d6cc7-b708-5ce6-bccf-12a2877cfbf1','Build payroll integration','Sync with ADP payroll system','TODO','HIGH','03653e21-8377-5d46-86ca-dec3e9489633',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
('b12cd796-1768-54e1-a6a4-97145c55a302','Implement time tracking','Built-in time logging for tasks','TODO','MEDIUM','df66c835-8386-5bc3-948d-58fcc3ca5a25',NOW()+INTERVAL '18 days',NOW()-INTERVAL '2 days',NOW()),
('035ab049-c549-5416-ae63-cf9180e8104c','Launch Chrome extension','Browser extension for quick capture','TODO','MEDIUM','66190234-9661-569f-a6a0-600fcadd5cdf',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
-- Remaining tasks to reach ~300
('ff08b79a-bd4e-5da9-8fe8-f4428f9e55ec','Improve CI pipeline speed','Parallelize test runs','DONE','MEDIUM','124734c4-3a6f-53f0-8659-cf718c612f38',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('e435af72-51d7-572b-b92c-2fd5f8246bb8','Create hiring plan','Q3 headcount planning','DONE','MEDIUM','074c3737-4688-5802-93db-344f6599556a',NOW()-INTERVAL '5 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '5 days'),
('abc6c33c-727e-5fd5-bded-00eef972b279','Build notification center','In-app notification hub','DONE','HIGH','f585a77e-f23b-5e3c-844e-a49ac67d00b5',NOW()-INTERVAL '2 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '2 days'),
('67bef664-2d33-5179-8588-5722a139d9bd','Design system audit','Audit component consistency','DONE','MEDIUM','48fb0e11-24ef-561b-a1c3-de4e78e1146e',NOW()-INTERVAL '4 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '4 days'),
('1744211b-9f9f-5bbc-b59a-6df832a9354b','Implement MFA backup codes','Recovery codes for 2FA','DONE','HIGH','797c7378-2da9-5726-b0cf-f94e3414e7be',NOW()-INTERVAL '1 day',NOW()-INTERVAL '12 days',NOW()-INTERVAL '1 day'),
('ce2155af-e086-59a1-ac88-61b8ee462f57','Create onboarding emails','Drip email series for new users','DONE','MEDIUM','b12bcdcf-8094-59e1-ba55-649d42709b39',NOW()-INTERVAL '6 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '6 days'),
('169fd6e5-0af3-536f-a138-ccfa39d398b8','Build bulk actions','Multi-select and bulk operations','DONE','MEDIUM','bb8c205e-21a2-5d23-8faa-d36356fd336a',NOW()-INTERVAL '3 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '3 days'),
('8d49bea9-f93b-5189-9a06-12955ae2bd69','Video testimonials','Record 5 customer testimonials','DONE','LOW','a18e129a-e338-5795-983d-8a501330cb4a',NOW()-INTERVAL '8 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '8 days'),
('f35a415f-20f6-568f-92c0-6bc0b12acc15','Implement smart notifications','Digest and priority filtering','DONE','HIGH','99b6fe84-ff7d-5bdb-83b8-3a5489963235',NOW()-INTERVAL '2 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days'),
('0638481f-074c-5a71-adf7-73cf06cfc58b','Build org chart tool','Visual org chart editor','DONE','MEDIUM','1ab387d3-afb8-5576-9717-6340bbd223c8',NOW()-INTERVAL '4 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '4 days'),
('cf8e366a-9159-5beb-9170-37ff7fa6337a','Add keyboard shortcuts','Power-user keyboard navigation','IN_PROGRESS','MEDIUM','124734c4-3a6f-53f0-8659-cf718c612f38',NOW()+INTERVAL '8 days',NOW()-INTERVAL '3 days',NOW()),
('c28b68af-658b-52e2-9dfa-447cdd4cab02','Employee recognition program','Peer-to-peer kudos system','IN_PROGRESS','LOW','074c3737-4688-5802-93db-344f6599556a',NOW()+INTERVAL '20 days',NOW()-INTERVAL '4 days',NOW()),
('43562e67-7886-53bf-839e-d24f20cad542','Build API gateway','Kong API gateway setup','IN_PROGRESS','HIGH','f585a77e-f23b-5e3c-844e-a49ac67d00b5',NOW()+INTERVAL '10 days',NOW()-INTERVAL '5 days',NOW()),
('9ed4791f-6345-58dc-af1c-830d95e54a17','Create interactive demos','Product tour with Intercom','IN_PROGRESS','MEDIUM','48fb0e11-24ef-561b-a1c3-de4e78e1146e',NOW()+INTERVAL '12 days',NOW()-INTERVAL '3 days',NOW()),
('204c4682-30ca-5881-bcb6-8b14ed0fc844','Implement smart forms','Conditional logic for forms','IN_PROGRESS','HIGH','797c7378-2da9-5726-b0cf-f94e3414e7be',NOW()+INTERVAL '7 days',NOW()-INTERVAL '2 days',NOW()),
('7b8952e0-6f40-5e95-8944-720e8ae0cbb7','Launch customer newsletter','Monthly customer digest','IN_PROGRESS','LOW','b12bcdcf-8094-59e1-ba55-649d42709b39',NOW()+INTERVAL '5 days',NOW()-INTERVAL '4 days',NOW()),
('0e15c3d6-c600-53b6-9318-e9bcc4bd9d14','Build workflow engine','Visual workflow builder','IN_PROGRESS','HIGH','bb8c205e-21a2-5d23-8faa-d36356fd336a',NOW()+INTERVAL '15 days',NOW()-INTERVAL '5 days',NOW()),
('050c2eb8-cf79-5ee1-953b-f2bb71e8caee','Plan annual retreat','Organize Q3 company offsite','IN_PROGRESS','LOW','04520b93-7e11-552f-b295-edeb017262e5',NOW()+INTERVAL '30 days',NOW()-INTERVAL '3 days',NOW()),
('da0c14b9-98fa-5680-af99-0225bfcb2cf9','Implement machine translation','Auto-translate content','IN_PROGRESS','HIGH','99b6fe84-ff7d-5bdb-83b8-3a5489963235',NOW()+INTERVAL '18 days',NOW()-INTERVAL '4 days',NOW()),
('8d2bef99-89e0-54df-b76f-7793979762b1','Redesign billing page','Clearer pricing and invoice UI','IN_PROGRESS','MEDIUM','b68da3ee-e439-5d6d-b73f-d54852ccc937',NOW()+INTERVAL '9 days',NOW()-INTERVAL '2 days',NOW()),
('9e287776-c931-5476-b800-813288deb2cd','Build SLA reports','Automated SLA compliance reports','TODO','HIGH','efe168e2-c99e-596b-b33d-aec789a7ed7c',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('881c0d1a-2ff0-5db5-b09f-a823339690aa','Create diversity report','Annual DEI metrics report','TODO','MEDIUM','59dd4167-15d7-5ab8-b2aa-1a8c82d665f5',NOW()+INTERVAL '28 days',NOW()-INTERVAL '1 day',NOW()),
('64be9bf6-d88a-532d-bcaf-1552e6eb0bd2','Implement event sourcing','CQRS/ES pattern migration','TODO','HIGH','1352156b-31c3-569a-bfbd-fb509c692e3e',NOW()+INTERVAL '45 days',NOW()-INTERVAL '2 days',NOW()),
('64f58fd1-7c70-5741-a18d-ed1e004c21f8','Build customer scoring','NPS-based health score system','TODO','HIGH','a18e129a-e338-5795-983d-8a501330cb4a',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
('831e60a3-4a56-5e56-9194-6c415cc1221e','Create localization guide','Translation workflow documentation','TODO','LOW','1ab387d3-afb8-5576-9717-6340bbd223c8',NOW()+INTERVAL '35 days',NOW()-INTERVAL '2 days',NOW()),
('65d25cce-f4f8-5d04-98fd-aecbec60728c','Implement predictive search','Typeahead with ML suggestions','TODO','HIGH','749cded8-9c92-5f6a-bde9-de28ee0a70e5',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
('c2a90011-de6d-557f-b01c-21ec9ea25a65','Build resource planner','Team capacity planning tool','TODO','HIGH','b68da3ee-e439-5d6d-b73f-d54852ccc937',NOW()+INTERVAL '30 days',NOW()-INTERVAL '2 days',NOW()),
('f14c75b1-2340-5c59-bbb4-ebe8b8886f02','Social listening setup','Brand monitoring with Mention','TODO','MEDIUM','2efaf9df-85a4-566e-bd92-4d28fed786e8',NOW()+INTERVAL '15 days',NOW()-INTERVAL '1 day',NOW()),
('f9bf552b-e316-518e-b505-3129da8d3e10','Implement smart alerts','Anomaly detection for metrics','TODO','HIGH','1ad79f99-afd2-52f4-8faa-eea46a2db5f1',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('e3e92c56-ab71-5221-847d-cdf7a52794d3','Build approval matrix','Configurable multi-level approvals','TODO','HIGH','b23bafbf-77a0-59dc-8d13-13f2435ffe58',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
-- Extra DONE tasks for score variety
('83f972dd-fc80-55f9-aa63-0db8180c6a7c','Setup log aggregation','ELK stack for centralized logs','DONE','HIGH','08fc5f51-4d44-5851-8c0f-a5b969ecabdc',NOW()-INTERVAL '4 days',NOW()-INTERVAL '15 days',NOW()-INTERVAL '4 days'),
('925e0cb2-3c38-5c29-87ff-810bc943c2c8','Create motion graphics','Animated explainer video assets','DONE','MEDIUM','add3fd41-3b28-586a-8c57-0a55ec530823',NOW()-INTERVAL '6 days',NOW()-INTERVAL '13 days',NOW()-INTERVAL '6 days'),
('aab82860-2f1a-5beb-ba8d-bc7b1b9b1547','Implement health checks','K8s liveness and readiness probes','DONE','MEDIUM','f05c21ed-0beb-5ef6-b36b-074423ba5dec',NOW()-INTERVAL '3 days',NOW()-INTERVAL '11 days',NOW()-INTERVAL '3 days'),
('554b86e3-b389-5dfd-854b-80b6fa355208','PR crisis management plan','Communications runbook for incidents','DONE','HIGH','d9332364-4056-5384-b62b-d8f415b4029f',NOW()-INTERVAL '2 days',NOW()-INTERVAL '9 days',NOW()-INTERVAL '2 days'),
('9efe5034-0dbd-5055-b701-8cae34a8b8a7','Merge HR systems','Consolidate BambooHR and Workday','DONE','HIGH','9fcc5215-f3d2-5391-af52-678baa4e1bb5',NOW()-INTERVAL '5 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '5 days'),
('1f2aa53b-758e-5d23-af10-a4f70b6955a4','New feature announcement','Blog post and email for v3.0','DONE','MEDIUM','bfde5230-00e1-5b64-9648-8d6c76c8f45a',NOW()-INTERVAL '4 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '4 days'),
('08eedaa8-3bda-5021-a05e-e491487eec5b','Build SCIM provisioning','Auto user provisioning via SCIM','DONE','HIGH','4b1a1c5a-044e-52e0-95a8-e23880b4f72c',NOW()-INTERVAL '2 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '2 days'),
('8e10107f-fc94-5f09-b8bc-dfdb23061a89','Remote work policy update','Update WFH policy for 2026','DONE','LOW','2010c087-c136-5f7b-9b5e-4237c81d817d',NOW()-INTERVAL '9 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '9 days'),
('b55ad75a-d841-567b-a504-209d512d4bf8','Implement Stripe webhooks','Handle payment lifecycle events','DONE','HIGH','13ad6e40-005e-57a1-b7f3-b6eac45600d3',NOW()-INTERVAL '1 day',NOW()-INTERVAL '12 days',NOW()-INTERVAL '1 day'),
('5942cb8f-097a-5129-a9cb-de29c92029e0','Create demo video','90-second product walkthrough','DONE','MEDIUM','d27309da-464c-5db4-bf9e-698816e45294',NOW()-INTERVAL '5 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '5 days'),
('d3b9e640-90b4-577a-b117-4fc2ac9a5c4f','Add telemetry','OpenTelemetry tracing setup','DONE','MEDIUM','8a64a264-b243-548f-934c-4bde8d2a386e',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('c27d3d6d-0262-500d-a50d-a10430e51876','Redesign empty states','Better UI for zero-data screens','DONE','LOW','e6984908-9d60-572e-936a-216817b13941',NOW()-INTERVAL '7 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '7 days'),
('53726260-05de-5b7b-82e1-f3a4921a0825','Build outbound webhook retries','Retry failed webhook deliveries','DONE','HIGH','57fc2970-86bb-54d7-ad76-f87400903759',NOW()-INTERVAL '2 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '2 days'),
('ed0fec48-dbd6-5e77-847f-961281bd2501','Competitive pricing analysis','Analyze competitor pricing models','DONE','MEDIUM','08b516dc-85fb-57c9-8f83-740207dc6995',NOW()-INTERVAL '6 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '6 days'),
('968dd6d5-e02a-5835-9fe1-107c6a96f810','Implement RBAC','Fine-grained role-based permissions','DONE','HIGH','a1956b30-3db0-51a5-a63a-1ab869110f08',NOW()-INTERVAL '1 day',NOW()-INTERVAL '12 days',NOW()-INTERVAL '1 day'),
('29309a70-bed3-5913-988d-d71272b31f28','Customer journey mapping','Map full user lifecycle','DONE','MEDIUM','373aa24a-3d48-536d-b2e9-4dc2e1ff58d4',NOW()-INTERVAL '4 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '4 days'),
('0a79b39e-c444-5cdb-b1a7-2647ac340bcb','Build team inbox','Shared inbox for support tickets','DONE','HIGH','dc8d6390-79cc-51bf-9b32-91000a84d3d0',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('219cfd77-060e-5f0d-8514-05981a2273b3','Setup A/B testing platform','Optimizely integration','DONE','MEDIUM','8ad71ffa-533c-5329-885e-e802e13cccfd',NOW()-INTERVAL '5 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '5 days'),
('3ef70b70-e4bb-5920-9ca6-da5c642f6161','Workforce planning model','Headcount forecasting model','DONE','MEDIUM','141ae427-06c6-535b-9274-678c6f0aa4f1',NOW()-INTERVAL '7 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '7 days'),
('2e1dcab3-d565-5850-bff7-fccbe016702e','Implement changelog','In-app product update feed','DONE','LOW','3c11f877-a165-52df-bb5d-f692b0e757f0',NOW()-INTERVAL '8 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '8 days'),
-- Final 100 tasks to reach 300
('0eac92a4-e60b-5c73-8484-03b6f8506829','Add custom domains','White-label domain support','TODO','HIGH','71789cf9-6288-5767-85ae-3d4efe684a9c',NOW()+INTERVAL '30 days',NOW()-INTERVAL '1 day',NOW()),
('a564f578-4ae2-5945-8c1d-11e9181847b8','Build feedback widget','In-app feedback collection','TODO','MEDIUM','4547e5e2-dcaf-5fe3-87e0-950367613bfc',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('9b11d62b-85d0-5b5a-a04c-d8e1c60c24f8','Implement smart tagging','Auto-tag content with ML','TODO','HIGH','dda8ff58-c611-50f9-8714-d53ca244ed3c',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
('57e8e54d-8b1e-5472-a6fb-8d218bb1b408','Create partner API','Dedicated API for partners','TODO','HIGH','f8247016-9cda-5543-a7e9-110be27b15f1',NOW()+INTERVAL '28 days',NOW()-INTERVAL '2 days',NOW()),
('bf96ae93-273c-5ab2-a1e5-dab794344e44','Build screen recorder','In-browser screen recording','TODO','HIGH','b8405422-5f14-59cd-a88b-61d85892edf8',NOW()+INTERVAL '35 days',NOW()-INTERVAL '1 day',NOW()),
('8b0adcf0-dbbb-5875-9f05-8088ead91822','Launch Slack integration','Bidirectional Slack sync','TODO','HIGH','6d2dc866-7797-58f4-9695-9bc5421fcca6',NOW()+INTERVAL '20 days',NOW()-INTERVAL '2 days',NOW()),
('6595bafc-d021-5b13-a361-d982fe2e79e2','Build time zone support','Global timezone handling','TODO','MEDIUM','eb215a3f-59c9-571a-ba2c-fc564021de65',NOW()+INTERVAL '15 days',NOW()-INTERVAL '1 day',NOW()),
('64aea940-5631-5c3b-b911-c64b7596db7a','Implement goal tracking','OKR management module','TODO','HIGH','0ab380c8-6f99-587c-b0cc-f3d1c8e94f9a',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('164ea81b-489b-5503-8482-b40addecfe8f','Create style tokens','Design token system for themes','TODO','MEDIUM','4ea8a886-f299-5b08-9d75-910117b4e1c6',NOW()+INTERVAL '18 days',NOW()-INTERVAL '1 day',NOW()),
('c88c8e2d-34bf-56b7-9c25-52c7e1992c43','Launch Jira integration','Sync tasks with Jira issues','TODO','HIGH','e00c2562-d4d6-55a6-a41d-ee73d2c7be6e',NOW()+INTERVAL '25 days',NOW()-INTERVAL '2 days',NOW()),
('d57e57e9-7fb2-5a6d-9fde-221528caf200','Build auto-scaling','AWS auto-scaling configuration','DONE','HIGH','c09b2121-93b2-5dc7-9cdc-3402e7be7a4d',NOW()-INTERVAL '2 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '2 days'),
('d41515ce-f986-5dea-88e0-d7f0d5540038','Customer success playbook','CS team runbooks','DONE','MEDIUM','03653e21-8377-5d46-86ca-dec3e9489633',NOW()-INTERVAL '5 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '5 days'),
('7ec95a2a-b33c-54e5-9ecc-8c374402b7ae','Implement smart routing','Intelligent request routing','DONE','HIGH','64052455-3aae-5171-89eb-07937f80d116',NOW()-INTERVAL '1 day',NOW()-INTERVAL '20 days',NOW()-INTERVAL '1 day'),
('c9403f59-fe96-512e-a28d-812704c95476','Design system tokens','Color and spacing token library','DONE','MEDIUM','340f5f65-43ea-5d52-80f5-5dcbf0ee05a8',NOW()-INTERVAL '4 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '4 days'),
('5bdfe973-d694-5a05-94a5-c7cc9aa77606','Build push notifications','Mobile push via FCM/APNs','DONE','HIGH','ed704a0e-8af6-5214-a850-55f6a2526f01',NOW()-INTERVAL '3 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '3 days'),
('c6406d94-4c6c-5a80-8689-f67c5e3b5de1','Plan hackathon event','Internal 48h hackathon planning','DONE','LOW','6de46a7d-bfbc-5999-a438-de5c1e053436',NOW()-INTERVAL '8 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '8 days'),
('841ef839-3cae-5fc1-b8b5-5dbb89f42a55','Implement smart caching','Adaptive TTL cache strategy','DONE','HIGH','ade8442a-2307-5c98-8395-5e21044c666f',NOW()-INTERVAL '2 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '2 days'),
('bfe4ce2e-7d82-5834-ab3b-e03fe24ec369','Build customer segments','Rule-based user segmentation','DONE','MEDIUM','fb71eaf5-877f-5b89-ba20-c7253097ecf9',NOW()-INTERVAL '5 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '5 days'),
('41604adf-2a47-58ab-a6aa-eb6c52fef1ba','Refactor billing service','Extract billing into microservice','DONE','HIGH','bb8c205e-21a2-5d23-8faa-d36356fd336a',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('b258af57-7051-5dfd-abcc-e8dc4a1417d6','Create employee NPS survey','Quarterly eNPS measurement','DONE','LOW','074c3737-4688-5802-93db-344f6599556a',NOW()-INTERVAL '9 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '9 days'),
('0135cf2f-2c80-53b8-a002-09e903d83f9e','Implement live chat','Intercom live chat integration','IN_PROGRESS','HIGH','f585a77e-f23b-5e3c-844e-a49ac67d00b5',NOW()+INTERVAL '6 days',NOW()-INTERVAL '3 days',NOW()),
('948d7640-7b1f-557c-8070-212ad096e4ed','Build AR preview','Augmented reality product preview','IN_PROGRESS','HIGH','99b6fe84-ff7d-5bdb-83b8-3a5489963235',NOW()+INTERVAL '45 days',NOW()-INTERVAL '5 days',NOW()),
('ce8cd1bf-444b-5830-ac2e-308d30c502c8','Create growth dashboard','Marketing funnel analytics','IN_PROGRESS','HIGH','b12bcdcf-8094-59e1-ba55-649d42709b39',NOW()+INTERVAL '8 days',NOW()-INTERVAL '2 days',NOW()),
('846a9fc5-7ad8-5e7d-9e80-e1edf52812bd','Implement smart scheduling','AI-powered meeting scheduler','IN_PROGRESS','HIGH','797c7378-2da9-5726-b0cf-f94e3414e7be',NOW()+INTERVAL '12 days',NOW()-INTERVAL '4 days',NOW()),
('f7cc4bb2-9586-58c6-8637-ac3b95ec8e61','Build peer learning platform','Internal knowledge sharing','IN_PROGRESS','MEDIUM','1ab387d3-afb8-5576-9717-6340bbd223c8',NOW()+INTERVAL '20 days',NOW()-INTERVAL '3 days',NOW()),
('186b4eba-189c-56d9-92e6-82b16e41ad50','Optimize image delivery','WebP conversion and lazy loading','IN_PROGRESS','MEDIUM','124734c4-3a6f-53f0-8659-cf718c612f38',NOW()+INTERVAL '7 days',NOW()-INTERVAL '2 days',NOW()),
('399b33af-a7c7-56f5-bdf6-f16eff2b72d4','Launch ambassador program','Brand ambassador recruitment','IN_PROGRESS','MEDIUM','a18e129a-e338-5795-983d-8a501330cb4a',NOW()+INTERVAL '15 days',NOW()-INTERVAL '4 days',NOW()),
('c589b4df-eda8-5264-94b6-e2c3ccbdacac','Build skills matrix','Team competency tracking','IN_PROGRESS','MEDIUM','04520b93-7e11-552f-b295-edeb017262e5',NOW()+INTERVAL '18 days',NOW()-INTERVAL '3 days',NOW()),
('b675e25a-4b74-5c84-90f4-6d5eba86dd4f','Implement service mesh','Istio service mesh deployment','IN_PROGRESS','HIGH','c09b2121-93b2-5dc7-9cdc-3402e7be7a4d',NOW()+INTERVAL '25 days',NOW()-INTERVAL '5 days',NOW()),
('982bc584-3bc8-5e81-8229-4728b2bf50dd','Create UX writing guide','Tone and voice documentation','IN_PROGRESS','LOW','340f5f65-43ea-5d52-80f5-5dcbf0ee05a8',NOW()+INTERVAL '14 days',NOW()-INTERVAL '2 days',NOW()),
('572c4635-124f-545e-8e70-afacbb14d7cc','Build data masking','PII anonymization for dev envs','TODO','HIGH','b68da3ee-e439-5d6d-b73f-d54852ccc937',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('f619b5cd-baef-5f47-b24b-82ffabe0b813','Create API versioning','Versioning strategy and migration','TODO','MEDIUM','749cded8-9c92-5f6a-bde9-de28ee0a70e5',NOW()+INTERVAL '18 days',NOW()-INTERVAL '1 day',NOW()),
('ce87f970-6c58-57a9-8614-cbaf90246231','Launch user group program','Regional user group initiative','TODO','LOW','2efaf9df-85a4-566e-bd92-4d28fed786e8',NOW()+INTERVAL '40 days',NOW()-INTERVAL '2 days',NOW()),
('9e9d869d-42b3-546a-be12-8841ac35423c','Build scenario planner','What-if analysis tool','TODO','HIGH','efe168e2-c99e-596b-b33d-aec789a7ed7c',NOW()+INTERVAL '30 days',NOW()-INTERVAL '1 day',NOW()),
('1cc01445-50ce-5fdb-b3c1-00fde6c86912','Implement smart alerts','Threshold-based anomaly alerts','TODO','HIGH','1ad79f99-afd2-52f4-8faa-eea46a2db5f1',NOW()+INTERVAL '25 days',NOW()-INTERVAL '2 days',NOW()),
('1ce17f78-1354-5d74-97ff-8f9bb4db1b93','Create sales playbook','Sales team process documentation','TODO','MEDIUM','59dd4167-15d7-5ab8-b2aa-1a8c82d665f5',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
('59ed3ae7-786e-59d1-8a9e-f593799deeb1','Build data catalog','Internal data dictionary','TODO','MEDIUM','1352156b-31c3-569a-bfbd-fb509c692e3e',NOW()+INTERVAL '28 days',NOW()-INTERVAL '2 days',NOW()),
('822217ff-659c-548f-b4a3-d62ebc9243fb','Implement GraphQL subscriptions','Real-time GraphQL events','TODO','HIGH','b23bafbf-77a0-59dc-8d13-13f2435ffe58',NOW()+INTERVAL '22 days',NOW()-INTERVAL '1 day',NOW()),
('24ab3a0d-0815-53d2-8ad9-add3180e470a','Create employee app','Internal mobile app for HR','TODO','HIGH','66190234-9661-569f-a6a0-600fcadd5cdf',NOW()+INTERVAL '35 days',NOW()-INTERVAL '2 days',NOW()),
('cef0925a-6594-5c92-86a0-a9301ada8a50','Build contract management','CLM system integration','TODO','HIGH','df66c835-8386-5bc3-948d-58fcc3ca5a25',NOW()+INTERVAL '30 days',NOW()-INTERVAL '1 day',NOW()),
('73d65567-32e7-5f2e-9c55-81c151fa6a31','Refactor email service','Move to event-driven emails','DONE','HIGH','08fc5f51-4d44-5851-8c0f-a5b969ecabdc',NOW()-INTERVAL '2 days',NOW()-INTERVAL '8 days',NOW()-INTERVAL '2 days'),
('3caa074c-f199-503b-96ff-44aaed6c2358','Launch award campaign','Industry award submission','DONE','LOW','d9332364-4056-5384-b62b-d8f415b4029f',NOW()-INTERVAL '10 days',NOW()-INTERVAL '22 days',NOW()-INTERVAL '10 days'),
('bc477550-09f9-5ba9-b9a8-96d0a501ca99','Build contract analyzer','AI contract review tool','DONE','HIGH','a736ae42-8dca-5298-93f1-99eeaa511037',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('ca005fe5-ad1e-59f9-86b5-794950b7c244','Create knowledge base','Self-service help articles','DONE','MEDIUM','d6c44974-67f0-5439-bf46-ec5fbb7c08f2',NOW()-INTERVAL '5 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '5 days'),
('9d506e40-1b41-5f6a-88ee-afacf7b0c71e','Implement queue system','RabbitMQ message queue setup','DONE','HIGH','4b1a1c5a-044e-52e0-95a8-e23880b4f72c',NOW()-INTERVAL '1 day',NOW()-INTERVAL '16 days',NOW()-INTERVAL '1 day'),
('33e0b40d-df20-579c-be2f-23e5aff1c27d','Conduct salary survey','Benchmark external salary data','DONE','MEDIUM','2010c087-c136-5f7b-9b5e-4237c81d817d',NOW()-INTERVAL '6 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '6 days'),
('ef8830bb-ab85-5118-ae83-b16b77b7eef0','Build quote generator','Dynamic pricing quote tool','DONE','HIGH','13ad6e40-005e-57a1-b7f3-b6eac45600d3',NOW()-INTERVAL '2 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '2 days'),
('9bafa1f6-b0d7-577f-a85b-a93e3c7e9720','Launch brand podcast','Company thought leadership podcast','DONE','MEDIUM','d27309da-464c-5db4-bf9e-698816e45294',NOW()-INTERVAL '4 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '4 days'),
('d09b290a-8563-5006-9037-b273453a364d','Implement feature tours','Guided feature walkthroughs','DONE','MEDIUM','8a64a264-b243-548f-934c-4bde8d2a386e',NOW()-INTERVAL '3 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '3 days'),
('bd7c6a56-1d9e-577b-8cfb-76ec320ea38e','Create revenue dashboard','Finance KPI reporting tool','DONE','HIGH','57fc2970-86bb-54d7-ad76-f87400903759',NOW()-INTERVAL '2 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days'),
('c5e995cf-e4a0-5870-9633-983adc71b53d','Build API health monitor','Continuous API testing','DONE','MEDIUM','a1956b30-3db0-51a5-a63a-1ab869110f08',NOW()-INTERVAL '4 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '4 days'),
('c5cd4f3d-17f0-5bcf-9bc9-5b6761a87493','Customer win-loss analysis','Post-deal analysis interviews','DONE','MEDIUM','373aa24a-3d48-536d-b2e9-4dc2e1ff58d4',NOW()-INTERVAL '6 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '6 days'),
('c5ff5aaf-eaf6-5d76-be43-f6434ec667ab','Implement batch processing','Async batch job framework','DONE','HIGH','dc8d6390-79cc-51bf-9b32-91000a84d3d0',NOW()-INTERVAL '1 day',NOW()-INTERVAL '12 days',NOW()-INTERVAL '1 day'),
('c6527d96-5f49-59d6-9000-b1880e6645d5','Plan product summit','Annual customer product day','DONE','MEDIUM','8ad71ffa-533c-5329-885e-e802e13cccfd',NOW()-INTERVAL '5 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '5 days'),
('2602271c-7d2b-5d04-8115-e6adf87b45a4','Migrate session storage','Redis-backed session management','DONE','HIGH','3c11f877-a165-52df-bb5d-f692b0e757f0',NOW()-INTERVAL '2 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '2 days'),
('67375c26-f1f5-53da-9bc4-93c48fa92664','Create visual identity','New visual brand guidelines','DONE','HIGH','5b99f16a-71fa-54a8-8a55-622cc0bb7e1c',NOW()-INTERVAL '3 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '3 days'),
('e2afc794-0581-5d48-929d-99082b49c439','Build smart search filters','Faceted search UI','DONE','MEDIUM','71789cf9-6288-5767-85ae-3d4efe684a9c',NOW()-INTERVAL '4 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '4 days'),
('7ce87942-d62a-5971-b064-7aaaf6a9c3b3','Employee wellness program','Mental health benefit rollout','DONE','LOW','047be7b6-ab77-5b6a-93b7-55d8b6e38ec3',NOW()-INTERVAL '8 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '8 days'),
('93876057-96b0-59d4-b06f-2efaf04edd1d','Implement request tracing','Distributed tracing with Jaeger','DONE','HIGH','4547e5e2-dcaf-5fe3-87e0-950367613bfc',NOW()-INTERVAL '2 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '2 days'),
('83240b09-6caa-596a-9b4a-2e9a7e315812','Launch co-marketing campaign','Joint campaign with Salesforce','DONE','HIGH','fc2885d7-52a3-5a00-95bb-24045d600250',NOW()-INTERVAL '3 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '3 days'),
('2008978c-d701-5f35-8229-e98ea24bced1','Build custom widgets','Embeddable report widgets','IN_PROGRESS','HIGH','7c63122e-c11c-5e81-8091-118841ffb597',NOW()+INTERVAL '9 days',NOW()-INTERVAL '4 days',NOW()),
('5549bd36-4457-5ca5-861a-9f188fc61c12','Redesign mobile checkout','Faster 1-tap mobile checkout','IN_PROGRESS','HIGH','42b1e5a5-3b3f-5305-a74f-b560135340f5',NOW()+INTERVAL '6 days',NOW()-INTERVAL '3 days',NOW()),
('b097d7ae-0d0a-55b4-a5aa-b7dd55f81ea5','Implement smart defaults','ML-based form prefilling','IN_PROGRESS','HIGH','b8405422-5f14-59cd-a88b-61d85892edf8',NOW()+INTERVAL '12 days',NOW()-INTERVAL '5 days',NOW()),
('f7c0b1f3-7830-55a1-92ef-bafffde7b72f','Create growth experiments','Systematic growth test backlog','IN_PROGRESS','MEDIUM','c5057b04-c2d1-5c81-9f9b-b38684fc96ac',NOW()+INTERVAL '15 days',NOW()-INTERVAL '3 days',NOW()),
('71c5baeb-ee45-59db-9d69-ce837206889d','Build org management','Hierarchy and team management','IN_PROGRESS','HIGH','6d2dc866-7797-58f4-9695-9bc5421fcca6',NOW()+INTERVAL '10 days',NOW()-INTERVAL '4 days',NOW()),
('c8ff4b0f-0622-5f12-b19a-5a626a994d2f','Document architecture','C4 model architecture diagrams','IN_PROGRESS','MEDIUM','eb215a3f-59c9-571a-ba2c-fc564021de65',NOW()+INTERVAL '8 days',NOW()-INTERVAL '2 days',NOW()),
('ffef5ea7-a58f-5eee-9df7-d99034d0f255','Run growth workshop','Team ideation sprint for growth','IN_PROGRESS','LOW','70cca839-6b19-58e4-8924-e38d88b33cca',NOW()+INTERVAL '5 days',NOW()-INTERVAL '3 days',NOW()),
('7140a684-7a99-5df3-bf99-83e43799507e','Build scenario modeling','Financial scenario planner','IN_PROGRESS','HIGH','0ab380c8-6f99-587c-b0cc-f3d1c8e94f9a',NOW()+INTERVAL '14 days',NOW()-INTERVAL '5 days',NOW()),
('7cc17188-718c-5b1d-bfe1-7f8afad07d23','Implement SSO for mobile','Mobile app SSO support','IN_PROGRESS','HIGH','e00c2562-d4d6-55a6-a41d-ee73d2c7be6e',NOW()+INTERVAL '11 days',NOW()-INTERVAL '4 days',NOW()),
('f0f7d3fb-92c7-576a-b7d7-53bfbf5cfe83','Design system audit v2','Quarterly design system review','IN_PROGRESS','MEDIUM','6a6928b9-9e5a-5719-8307-973618acaaf0',NOW()+INTERVAL '7 days',NOW()-INTERVAL '2 days',NOW()),
('3a346b9a-1872-5fec-91fc-6d92f7cd7bea','Build custom integrations','No-code integration builder','TODO','HIGH','64052455-3aae-5171-89eb-07937f80d116',NOW()+INTERVAL '40 days',NOW()-INTERVAL '2 days',NOW()),
('fee95dec-6118-56df-b789-c657f1028095','Create podcast strategy','Thought leadership audio content','TODO','LOW','df66c835-8386-5bc3-948d-58fcc3ca5a25',NOW()+INTERVAL '35 days',NOW()-INTERVAL '1 day',NOW()),
('35b28478-624c-5e41-9e44-d32ac271d945','Implement smart grouping','Auto-group related items','TODO','MEDIUM','ed704a0e-8af6-5214-a850-55f6a2526f01',NOW()+INTERVAL '22 days',NOW()-INTERVAL '2 days',NOW()),
('822271c3-2196-5e5a-bba7-b28e95c5c048','Build leave management','PTO tracking and approval','TODO','MEDIUM','ade8442a-2307-5c98-8395-5e21044c666f',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
('f8b5d1a1-7c7e-538b-b90b-4bae5abb2ff6','Implement token refresh','JWT refresh token rotation','TODO','HIGH','fb71eaf5-877f-5b89-ba20-c7253097ecf9',NOW()+INTERVAL '12 days',NOW()-INTERVAL '2 days',NOW()),
('9957bec8-d604-5165-9989-1b7f9915cb6e','Create media library','Centralized asset management','TODO','MEDIUM','124734c4-3a6f-53f0-8659-cf718c612f38',NOW()+INTERVAL '25 days',NOW()-INTERVAL '1 day',NOW()),
('ee5f144c-804c-5de6-9cf4-fd303f3ddfb3','Build usage analytics','Per-feature usage tracking','TODO','HIGH','bb8c205e-21a2-5d23-8faa-d36356fd336a',NOW()+INTERVAL '18 days',NOW()-INTERVAL '2 days',NOW()),
('58df6fd3-c42d-50ee-bcf4-67295682d7bd','Design system for emails','Email component library','TODO','MEDIUM','1ad79f99-afd2-52f4-8faa-eea46a2db5f1',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day',NOW()),
('767fd884-b6fb-5d2e-9670-6b3a94972fd7','Implement smart routing','Context-aware task routing','TODO','HIGH','f585a77e-f23b-5e3c-844e-a49ac67d00b5',NOW()+INTERVAL '28 days',NOW()-INTERVAL '2 days',NOW()),
('6e5f1526-30bf-509b-b46c-fa27431c276e','Build team health checks','Regular team retrospective tool','TODO','LOW','04520b93-7e11-552f-b295-edeb017262e5',NOW()+INTERVAL '30 days',NOW()-INTERVAL '1 day',NOW()),
('1e795528-e0c0-5faf-a887-1c1908c7abbf','Refactor API versioning','Deprecation and migration tooling','DONE','MEDIUM','99b6fe84-ff7d-5bdb-83b8-3a5489963235',NOW()-INTERVAL '4 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '4 days'),
('24e412b1-8c49-593f-b72b-8f7bc1d5b148','Create go-to-market plan','GTM strategy for new market','DONE','HIGH','b12bcdcf-8094-59e1-ba55-649d42709b39',NOW()-INTERVAL '2 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '2 days'),
('761c4126-4927-56d6-933b-cd43dc51ee5d','Build deployment pipeline','Zero-downtime blue/green deploys','DONE','HIGH','797c7378-2da9-5726-b0cf-f94e3414e7be',NOW()-INTERVAL '1 day',NOW()-INTERVAL '8 days',NOW()-INTERVAL '1 day'),
('faa39065-a3a6-52ab-9352-80fc23f13e2f','Design print materials','Brochures for trade show','DONE','LOW','749cded8-9c92-5f6a-bde9-de28ee0a70e5',NOW()-INTERVAL '9 days',NOW()-INTERVAL '20 days',NOW()-INTERVAL '9 days'),
('d154b08b-10f2-546a-942d-5f99cd8ee031','Implement token audit log','Track all API token usage','DONE','HIGH','b68da3ee-e439-5d6d-b73f-d54852ccc937',NOW()-INTERVAL '2 days',NOW()-INTERVAL '18 days',NOW()-INTERVAL '2 days'),
('49b41a6a-68fc-58be-ac4a-7a6a92ff5b59','Create recruitment brand','Employer branding materials','DONE','MEDIUM','074c3737-4688-5802-93db-344f6599556a',NOW()-INTERVAL '5 days',NOW()-INTERVAL '16 days',NOW()-INTERVAL '5 days'),
('020f5394-43d3-59e1-8466-4630848406da','Build multi-region support','Geographic data residency','DONE','HIGH','1352156b-31c3-569a-bfbd-fb509c692e3e',NOW()-INTERVAL '3 days',NOW()-INTERVAL '14 days',NOW()-INTERVAL '3 days'),
('b1be1342-3d4d-5753-a5c0-8ff26367204d','Plan customer day event','Annual customer appreciation day','DONE','MEDIUM','a18e129a-e338-5795-983d-8a501330cb4a',NOW()-INTERVAL '6 days',NOW()-INTERVAL '12 days',NOW()-INTERVAL '6 days'),
('09cb7c5a-684d-594b-accb-c05304ac1d08','Implement circuit breaker','Resilience patterns for services','DONE','HIGH','48fb0e11-24ef-561b-a1c3-de4e78e1146e',NOW()-INTERVAL '2 days',NOW()-INTERVAL '10 days',NOW()-INTERVAL '2 days'),
('664e75c1-32bb-5c0c-abbc-23bee162a680','Create launch checklist','Product launch go-live checklist','DONE','MEDIUM','1ab387d3-afb8-5576-9717-6340bbd223c8',NOW()-INTERVAL '4 days',NOW()-INTERVAL '8 days',NOW()-INTERVAL '4 days'),
('6d901724-9f7b-51c8-aada-ba213cdf4d4e','Build NPS collection','Automated NPS survey system','IN_PROGRESS','MEDIUM','b23bafbf-77a0-59dc-8d13-13f2435ffe58',NOW()+INTERVAL '9 days',NOW()-INTERVAL '3 days',NOW()),
('3307616b-a020-591a-936a-233ba2fd4185','Implement smart filtering','AI-assisted filter suggestions','IN_PROGRESS','HIGH','efe168e2-c99e-596b-b33d-aec789a7ed7c',NOW()+INTERVAL '12 days',NOW()-INTERVAL '4 days',NOW()),
('5fd22498-699a-5fba-8936-19d42b0452f8','Create sales enablement','Battle cards and objection handling','IN_PROGRESS','MEDIUM','59dd4167-15d7-5ab8-b2aa-1a8c82d665f5',NOW()+INTERVAL '10 days',NOW()-INTERVAL '3 days',NOW()),
('07f52a76-d6c4-5e97-8f98-1686160c1bd3','Build expense tracking','Employee expense submission','IN_PROGRESS','MEDIUM','66190234-9661-569f-a6a0-600fcadd5cdf',NOW()+INTERVAL '15 days',NOW()-INTERVAL '5 days',NOW()),
('528386ff-b8c0-549c-adf5-1ad0d26756ce','Implement geo-blocking','Country-based access control','IN_PROGRESS','HIGH','2efaf9df-85a4-566e-bd92-4d28fed786e8',NOW()+INTERVAL '7 days',NOW()-INTERVAL '2 days',NOW()),
('aacbcb36-733f-5a81-b50b-36066933f34a','Create swag store','Employee merchandise shop','IN_PROGRESS','LOW','6de46a7d-bfbc-5999-a438-de5c1e053436',NOW()+INTERVAL '25 days',NOW()-INTERVAL '4 days',NOW()),
('f837f7ae-6513-5a85-8fbb-d880d00b6d01','Build resource center','In-app resource library','IN_PROGRESS','MEDIUM','3788aed4-622f-597b-8d2c-b36cae584778',NOW()+INTERVAL '11 days',NOW()-INTERVAL '3 days',NOW()),
('19b44941-be7e-5300-8bc8-1382e5e1a4fa','Implement content versioning','Draft and publish workflow','IN_PROGRESS','HIGH','56c26fed-b0e2-5025-be0b-ca0c936ca04e',NOW()+INTERVAL '8 days',NOW()-INTERVAL '5 days',NOW()),
('a80fbece-331e-56ae-b71b-c98152ca0592','Create churn playbook','Customer retention runbooks','IN_PROGRESS','HIGH','70cca839-6b19-58e4-8924-e38d88b33cca',NOW()+INTERVAL '14 days',NOW()-INTERVAL '4 days',NOW()),
('b1a98408-17b7-5d22-9cdb-6735b8391514','Build localization pipeline','Automated translation workflow','IN_PROGRESS','HIGH','e599486a-aabc-5168-9671-e7ef84c21967',NOW()+INTERVAL '18 days',NOW()-INTERVAL '3 days',NOW());

-- -----------------------------------------------
-- SCORE EVENTS for all DONE bulk tasks (tx001–tx050, tx101–tx120, tx151–tx160, tx181–tx200, tx211–tx220, tx241–tx260, tx281–tx290)
-- Priority: HIGH=20, MEDIUM=10, LOW=5
-- All completed before due date => +5 bonus each
-- -----------------------------------------------
INSERT INTO score_events (id, user_id, task_id, points, bonus, penalty, total_awarded, created_at)
SELECT
  gen_random_uuid(),
  t.assignee_id,
  t.id,
  CASE t.priority WHEN 'HIGH' THEN 20 WHEN 'MEDIUM' THEN 10 ELSE 5 END,
  5,  -- early bonus (completed before due date in all cases above)
  0,
  CASE t.priority WHEN 'HIGH' THEN 25 WHEN 'MEDIUM' THEN 15 ELSE 10 END,
  t.updated_at
FROM tasks t
WHERE t.status = 'DONE'
  AND t.assignee_id IS NOT NULL
  AND t.id NOT IN (
    SELECT task_id FROM score_events
  );

-- -----------------------------------------------
-- PRODUCTIVITY SCORES — upsert aggregates for all affected users
-- -----------------------------------------------
INSERT INTO productivity_scores (id, user_id, total_score, tasks_completed, updated_at)
SELECT
  gen_random_uuid(),
  se.user_id,
  SUM(se.total_awarded),
  COUNT(se.id),
  NOW()
FROM score_events se
GROUP BY se.user_id
ON CONFLICT (user_id) DO UPDATE
  SET total_score     = EXCLUDED.total_score,
      tasks_completed = EXCLUDED.tasks_completed,
      updated_at      = NOW();
