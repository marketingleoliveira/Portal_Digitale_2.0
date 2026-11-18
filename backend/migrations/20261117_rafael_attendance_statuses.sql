-- Os sete status são exibidos no módulo. O bloqueio de contato é um atributo independente.
ALTER TABLE rafael_attendance_calls ADD COLUMN do_not_contact TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
UPDATE rafael_attendance_calls SET do_not_contact=1, status='recusado' WHERE status='nao_contatar';
UPDATE rafael_attendance_calls SET status='recuperar' WHERE status='agendamento_simulado';
