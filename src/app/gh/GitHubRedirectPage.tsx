// Changed by the peekdiff authors: upstream DiffsHub redirected /gh to
// diffshub.com; peekdiff sends it to its own home instead.
import { redirect } from 'next/navigation';

export function GitHubRedirectPage() {
  redirect('/');
}
