import { isAuthed } from '../../../lib/auth';

export async function GET(request) {
  return Response.json({ authed: isAuthed(request) });
}
