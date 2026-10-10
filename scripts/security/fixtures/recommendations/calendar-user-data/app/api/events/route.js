import { getServerSession } from 'next-auth';
export async function GET() {
  const session = await getServerSession();
  if (!session) return new Response(null, { status: 401 });
  return Response.json({ events: [] });
}
