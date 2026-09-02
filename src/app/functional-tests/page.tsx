import { redirect } from 'next/navigation'

// L4 now lives at /checklists/l4 with the other four levels. This page is kept
// so an existing bookmark or an emailed link still lands somewhere useful.
export default function FunctionalTestsPage() {
  redirect('/checklists/l4')
}
