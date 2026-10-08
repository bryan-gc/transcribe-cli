import type { SeededNote } from './archive.js';

const FILLER = 'Hoy en la reunión del equipo tenemos que revisar lo pendiente y lo que sigue';

export function corpus(): SeededNote[] {
  return [
    {
      daysAgo: 1,
      text: `${FILLER}. Desplegamos con Pulumi y k8s. Mañana vemos el Billing Service.`,
      topic: 'work',
    },
    {
      daysAgo: 2,
      text: `${FILLER}. El stack de Pulumi falla en k8s. Revisa Grafana por favor.`,
      topic: 'work',
    },
    {
      daysAgo: 3,
      text: `${FILLER}. Pulumi otra vez y el Billing Service con Grafana.`,
      topic: 'work',
    },
    {
      daysAgo: 4,
      text: `${FILLER}. Mañana cerramos k8s con Pulumi y Grafana. Subtítulos realizados por la comunidad de Amara.org`,
      topic: 'work',
    },
    {
      daysAgo: 5,
      text: `[Speaker A] ${FILLER}.\n[Speaker B] El Billing Service ya responde. Ansible quedó listo. Subtítulos realizados por la comunidad de Amara.org`,
    },
    {
      daysAgo: 6,
      text: `Ana: ${FILLER}.\nAna: Mañana compro zanahoria, zanahoria y zanahoria. Usamos Ansible. Subtítulos realizados por la comunidad de Amara.org`,
    },
    { daysAgo: 7, text: `Ana: ${FILLER}. Ansible y más Ansible.` },
    { daysAgo: 8, text: `${FILLER}. Nada nuevo.` },
    { daysAgo: 40, text: 'Viejo: con Terraform todo. Lo de Terraform sigue.' },
    { daysAgo: 45, text: 'Más viejo: el plan de Terraform.' },
  ];
}
