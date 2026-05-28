-- Rename department "b2b" → "cgc" (Comercial Grandes Contas)
-- O valor 'b2b' era contra-intuitivo; a sigla oficial é CGC.

-- 1. Renomear o valor no enum (PostgreSQL 10+ suporta RENAME VALUE)
ALTER TYPE public.department_type RENAME VALUE 'b2b' TO 'cgc';

-- 2. Atualizar tabela departments (label, prefixo de username, etc.)
UPDATE public.departments
   SET key = 'cgc'
 WHERE key = 'b2b';

-- 3. Atualizar department_functions
UPDATE public.department_functions
   SET department_type = 'cgc'
 WHERE department_type = 'b2b';

-- 4. Atualizar function_screen_access
UPDATE public.function_screen_access
   SET department = 'cgc'
 WHERE department = 'b2b';

-- 5. Atualizar profiles — departamento primário
UPDATE public.profiles
   SET department = 'cgc'
 WHERE department = 'b2b';

-- 6. Atualizar profiles — departamento secundário
UPDATE public.profiles
   SET secondary_department = 'cgc'
 WHERE secondary_department = 'b2b';
