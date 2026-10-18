-- Duas regras novas no catálogo do motor: aulas da mesma disciplina no
-- mesmo dia juntas (aulas_juntas) e disciplina nos mesmos horários em todas
-- as turmas do turno (disciplina_sincronizada).
alter table regras drop constraint regras_tipo_check;
alter table regras add constraint regras_tipo_check check (tipo in (
  'disponibilidade_professor', 'geminadas', 'recurso_compartilhado',
  'janelas_professor', 'distribuicao_disciplina', 'preferencia_professor',
  'preferencia_disciplina', 'compactacao_dias', 'ultimo_horario',
  'nao_mesmo_dia', 'aulas_juntas', 'disciplina_sincronizada'
));
