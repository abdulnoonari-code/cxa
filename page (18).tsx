import { redirect } from 'next/navigation'

// L5 now lives at /checklists/l5 with the other four levels. Kept so an
// existing bookmark or an emailed link still lands somewhere useful.
export default function IntegratedTestsPage() {
  redirect('/checklists/l5')
}
